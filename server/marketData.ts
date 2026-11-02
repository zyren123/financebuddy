import { MARKET_FEEDS, type MarketData, type MarketFeed, type PriceFeed } from '../src/market/model.js'
import { parseMarketData, readArray, readNumber, readObject } from '../src/market/schema.js'
import type { MarketInputs } from '../src/readings/compute.js'
import type { LayoutStore } from './layoutApi.js'

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

async function fetchFeed(feed: MarketFeed, fetcher: typeof fetch, now: number): Promise<MarketData> {
  const response = await fetcher(upstreamUrl(feed), {
    headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; FinanceBuddy/0.1)' },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`来源返回 HTTP ${response.status}`)
  const raw: unknown = await response.json()
  return feed === 'valuations' ? parseValuations(raw) : feed === 'fear-greed' ? parseFearGreed(raw) : parseYahooPrices(feed, raw, now)
}

/** 与 LayoutStore 同形的字符串 KV;VPS 用同一个 Redis(键 market:*),平台与开发用内存 */
export type TextStore = LayoutStore

export function createMemoryTextStore(): TextStore {
  const map = new Map<string, string>()
  return { get: async (key) => map.get(key) ?? null, put: async (key, value) => void map.set(key, value) }
}

export const MARKET_TTL_MS: Record<MarketFeed, number> = {
  sp500: 6 * 3_600_000,
  nasdaq100: 6 * 3_600_000,
  vix: 6 * 3_600_000,
  valuations: 6 * 3_600_000,
  'fear-greed': 30 * 60_000,
}

export const marketKey = (feed: MarketFeed) => `market:${feed}`

/**
 * 五个 feed 各自维持"最近一次成功"的解析结果并持久化:TTL 内直接用存储;过期抓上游,成功写回,
 * 失败回存储里的旧值(带它自己的旧日期);连旧值都没有 → null。
 * 不做并发合并:唯一调用方 readings 服务的 refresh 本身是单飞的。
 */
export function createMarketSource({ store, fetcher = fetch, now = Date.now }: {
  store: TextStore
  fetcher?: typeof fetch
  now?: () => number
}): { load(): Promise<MarketInputs> } {
  async function stored(feed: MarketFeed): Promise<{ data: MarketData; fetchedAt: number } | null> {
    try {
      const raw = await store.get(marketKey(feed))
      if (!raw) return null
      const body = readObject(JSON.parse(raw))
      // 重新校验:存储形状跨版本漂移时当作没有
      return { data: parseMarketData(feed, body.data), fetchedAt: readNumber(body.fetchedAt) }
    } catch {
      return null
    }
  }

  async function loadFeed(feed: MarketFeed): Promise<MarketData | null> {
    const old = await stored(feed)
    if (old && now() - old.fetchedAt < MARKET_TTL_MS[feed]) return old.data
    try {
      const data = await fetchFeed(feed, fetcher, now())
      await store.put(marketKey(feed), JSON.stringify({ data, fetchedAt: now() })).catch((err: unknown) => {
        console.error('market store put failed', feed, err)
      })
      return data
    } catch (err) {
      console.warn(JSON.stringify({ market: feed, error: String(err), stale: old !== null }))
      return old?.data ?? null
    }
  }

  return {
    async load() {
      const [sp500, nasdaq100, vix, valuations, fearGreed] = await Promise.all(MARKET_FEEDS.map(loadFeed))
      return {
        sp500: sp500 && 'bars' in sp500 ? sp500 : null,
        nasdaq100: nasdaq100 && 'bars' in nasdaq100 ? nasdaq100 : null,
        vix: vix && 'bars' in vix ? vix : null,
        valuations: valuations?.feed === 'valuations' ? valuations : null,
        'fear-greed': fearGreed?.feed === 'fear-greed' ? fearGreed : null,
      }
    },
  }
}
