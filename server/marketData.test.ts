import { describe, expect, it, vi } from 'vitest'
import { createMarketApi, parseFearGreed, parseValuations, parseYahooPrices } from './marketData'
import { parseMarketData } from '../src/market/schema'

const sessionStart = Date.parse('2026-10-15T13:30:00Z') / 1000
const sessionEnd = Date.parse('2026-10-15T20:00:00Z') / 1000
const yahoo = {
  chart: { result: [{
    meta: { symbol: '^GSPC', instrumentType: 'INDEX', currentTradingPeriod: { regular: { start: sessionStart, end: sessionEnd } } },
    timestamp: [sessionStart - 86400, sessionStart],
    indicators: { quote: [{ close: [100, 105], high: [102, 108] }] },
  }] },
}
const valuation = { result_code: 0, data: { items: [
  { index_code: 'SP500', pe: 25.1, pe_percentile: 0, ts: Date.parse('2026-10-15T00:00:00+08:00') },
  { index_code: 'NDX', pe: 30.04, pe_percentile: 0.4508, ts: Date.parse('2026-10-15T00:00:00+08:00') },
] } }

describe('公开市场数据边界', () => {
  it('收盘前排除未完成日线，收盘后纳入，并保持纽约交易日期', () => {
    expect(parseYahooPrices('sp500', yahoo, (sessionEnd - 1) * 1000)).toEqual({
      feed: 'sp500', bars: [{ date: '2026-10-14', close: 100, high: 102 }],
    })
    expect(parseYahooPrices('sp500', yahoo, sessionEnd * 1000)).toEqual({
      feed: 'sp500', bars: [{ date: '2026-10-14', close: 100, high: 102 }, { date: '2026-10-15', close: 105, high: 108 }],
    })
    expect(() => parseYahooPrices('nasdaq100', yahoo, sessionEnd * 1000)).toThrow('其他标的')
  })

  it('蛋卷估值保留 0 百分位，按来源的上海日期读取，不前移一天', () => {
    const data = parseValuations(valuation)
    expect(data).toEqual({ feed: 'valuations', indices: [
      { index: 'sp500', date: '2026-10-15', pe: 25.1, percentile: 0 },
      { index: 'nasdaq100', date: '2026-10-15', pe: 30.04, percentile: 45.08 },
    ] })
    expect(parseMarketData('valuations', JSON.parse(JSON.stringify(data)))).toEqual(data)
    expect(() => parseValuations({ result_code: 400 })).toThrow()
  })

  it('CNN 的 0 分有效，缺日期或超出范围不能显示为读数', () => {
    expect(parseFearGreed({ fear_and_greed: { score: 0, timestamp: '2026-10-15T22:00:00Z' } })).toEqual({ feed: 'fear-greed', score: 0, date: '2026-10-15' })
    expect(() => parseFearGreed({ fear_and_greed: { score: 101, timestamp: '2026-10-15T22:00:00Z' } })).toThrow()
    expect(() => parseFearGreed({ fear_and_greed: { score: 50 } })).toThrow()
  })

  it('客户端拒绝串源、重复日期和伪读数，不把错误页解析成行情', () => {
    expect(() => parseMarketData('vix', { feed: 'sp500', bars: [] })).toThrow()
    expect(() => parseMarketData('sp500', { feed: 'sp500', bars: [
      { date: '2026-10-15', close: 100, high: 101 }, { date: '2026-10-15', close: 102, high: 103 },
    ] })).toThrow()
    expect(() => parseMarketData('sp500', { feed: 'sp500', bars: [{ date: '2026-02-30', close: 100, high: 101 }] })).toThrow()
    expect(() => parseMarketData('sp500', '<html>blocked</html>')).toThrow()
  })
})

describe('GET /api/market', () => {
  it('仅允许固定来源，不允许开放代理、重复参数或写请求', async () => {
    const fetcher = vi.fn<typeof fetch>()
    const handle = createMarketApi(fetcher)
    for (const query of ['feed=anything', 'feed=sp500&url=https://example.com', 'feed=sp500&feed=vix', '']) {
      expect((await handle(new Request(`https://local/api/market?${query}`))).status).toBe(400)
    }
    expect((await handle(new Request('https://local/api/market?feed=sp500', { method: 'POST' }))).status).toBe(405)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('相同来源的并发访客共用请求和六小时缓存', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(valuation))
    let now = 1_000_000
    const handle = createMarketApi(fetcher, () => now)
    const request = () => new Request('https://local/api/market?feed=valuations')
    const results = await Promise.all([handle(request()), handle(request())])
    expect(results.every((result) => result.status === 200)).toBe(true)
    expect(await results[0].json()).toEqual(parseValuations(valuation))
    await handle(request())
    expect(fetcher).toHaveBeenCalledTimes(1)
    now += 6 * 60 * 60_000 + 1
    await handle(request())
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('CNN 失败不造值，来源恢复后用户立即重试即可读取，不命中缓存失败', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockImplementationOnce(async () => new Response('blocked', { status: 418 }))
      .mockImplementation(async () => Response.json({ fear_and_greed: { score: 42, timestamp: '2026-10-15T22:00:00Z' } }))
    const handle = createMarketApi(fetcher, () => 1_000_000)
    const request = () => new Request('https://local/api/market?feed=fear-greed')
    const response = await handle(request())
    expect(response.status).toBe(502)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ error: '数据来源暂不可用，请稍后重试。' })
    const recovered = await handle(request())
    expect(recovered.status).toBe(200)
    expect(await recovered.json()).toEqual({ feed: 'fear-greed', score: 42, date: '2026-10-15' })
    expect(fetcher).toHaveBeenCalledTimes(2)
    await handle(request())
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
