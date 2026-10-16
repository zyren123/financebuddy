import { MARKET_FEEDS, type MarketData, type MarketFeed, type PriceFeed } from '../src/market/model.js'
import { readArray, readNumber, readObject } from '../src/market/schema.js'

const PRICE_SYMBOLS = { sp500: '^GSPC', nasdaq100: '^NDX', vix: '^VIX' }
const UPSTREAM_TIMEOUT_MS = 12_000

function calendarDate(milliseconds: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(milliseconds)
}

export function parseYahooPrices(feed: PriceFeed, value: unknown, now: number): MarketData {
  const chart = readObject(readObject(value).chart)
  const result = readObject(readArray(chart.result)[0])
  const meta = readObject(result.meta)
  if (meta.symbol !== PRICE_SYMBOLS[feed] || meta.instrumentType !== 'INDEX') throw new Error('上游返回了其他标的')
  const period = readObject(readObject(meta.currentTradingPeriod).regular)
  const sessionStart = readNumber(period.start)
  const sessionEnd = readNumber(period.end)
  const quote = readObject(readArray(readObject(result.indicators).quote)[0])
  const closes = readArray(quote.close)
  const highs = readArray(quote.high)
  const bars = readArray(result.timestamp).flatMap((raw, index) => {
    const timestamp = readNumber(raw)
    if (timestamp >= sessionStart && now / 1000 < sessionEnd) return []
    const close = closes[index]
    const high = highs[index]
    if (typeof close !== 'number' || !Number.isFinite(close) || close <= 0 || typeof high !== 'number' || !Number.isFinite(high) || high < close) return []
    return [{ date: calendarDate(timestamp * 1000, 'America/New_York'), close, high }]
  })
  if (!bars.length) throw new Error('暂无已完成的指数日线')
  return { feed, bars }
}

export function parseValuations(value: unknown): MarketData {
  const body = readObject(value)
  if (body.result_code !== 0) throw new Error('估值来源暂不可用')
  const items = readArray(readObject(body.data).items).map(readObject)
  const indices = ([{ code: 'SP500', index: 'sp500' }, { code: 'NDX', index: 'nasdaq100' }] as const).flatMap(({ code, index }) => {
    const row = items.find((item) => item.index_code === code)
    if (!row) return []
    const timestamp = readNumber(row.ts)
    const pe = typeof row.pe === 'number' && Number.isFinite(row.pe) && row.pe > 0 ? row.pe : null
    const percentile = typeof row.pe_percentile === 'number' && Number.isFinite(row.pe_percentile) && row.pe_percentile >= 0 && row.pe_percentile <= 1 ? row.pe_percentile * 100 : null
    return [{ index, date: calendarDate(timestamp, 'Asia/Shanghai'), pe, percentile }]
  })
  if (!indices.length) throw new Error('估值来源没有返回这两个指数')
  return { feed: 'valuations', indices }
}

export function parseFearGreed(value: unknown): MarketData {
  const point = readObject(readObject(value).fear_and_greed)
  const score = readNumber(point.score)
  const timestamp = typeof point.timestamp === 'string' ? Date.parse(point.timestamp) : Number.NaN
  if (score < 0 || score > 100 || !Number.isFinite(timestamp)) throw new Error('CNN 读数或日期无效')
  return { feed: 'fear-greed', score, date: calendarDate(timestamp, 'America/New_York') }
}

function upstreamUrl(feed: MarketFeed): string {
  switch (feed) {
    case 'sp500':
    case 'nasdaq100':
    case 'vix': return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(PRICE_SYMBOLS[feed])}?range=2y&interval=1d`
    case 'valuations': return 'https://danjuanfunds.com/djapi/index_eva/dj'
    case 'fear-greed': return 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata'
  }
}

type Result = { status: number; body: string }

export function marketFeedFromRequest(request: Request): MarketFeed | Response {
  if (request.method !== 'GET') return Response.json({ error: 'method not allowed' }, { status: 405, headers: { allow: 'GET' } })
  const url = new URL(request.url)
  const feed = MARKET_FEEDS.find((item) => item === url.searchParams.get('feed'))
  if (!feed || [...url.searchParams.keys()].some((key) => key !== 'feed') || url.searchParams.getAll('feed').length !== 1) {
    return Response.json({ error: 'unknown market feed' }, { status: 400 })
  }
  return feed
}

export function createMarketApi(fetcher: typeof fetch = fetch, now: () => number = Date.now) {
  const cache = new Map<MarketFeed, { result: Result; expires: number }>()
  const pending = new Map<MarketFeed, Promise<Result>>()
  async function load(feed: MarketFeed): Promise<Result> {
    const hit = cache.get(feed)
    if (hit && hit.expires > now()) return hit.result
    const running = pending.get(feed)
    if (running) return running
    const work = (async () => {
      let result: Result
      try {
        const response = await fetcher(upstreamUrl(feed), {
          headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; FinanceBuddy/0.1)' },
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        })
        if (!response.ok) throw new Error(`来源返回 HTTP ${response.status}`)
        const raw: unknown = await response.json()
        const data = feed === 'valuations' ? parseValuations(raw) : feed === 'fear-greed' ? parseFearGreed(raw) : parseYahooPrices(feed, raw, now())
        result = { status: 200, body: JSON.stringify(data) }
      } catch {
        result = { status: 502, body: JSON.stringify({ error: '数据来源暂不可用，请稍后重试。' }) }
      }
      if (result.status === 200) {
        const ttl = feed === 'fear-greed' ? 30 * 60_000 : 6 * 60 * 60_000
        cache.set(feed, { result, expires: now() + ttl })
      }
      return result
    })()
    pending.set(feed, work)
    try { return await work } finally { pending.delete(feed) }
  }

  return async function handle(request: Request): Promise<Response> {
    const feed = marketFeedFromRequest(request)
    if (feed instanceof Response) return feed
    const result = await load(feed)
    return new Response(result.body, { status: result.status, headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': result.status === 200 ? 'public, max-age=60, s-maxage=3600' : 'no-store',
    } })
  }
}

export const handleMarketRequest = createMarketApi()
