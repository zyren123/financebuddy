import { afterEach, describe, expect, it, vi } from 'vitest'
import { onRequest } from '../functions/api/market/index'
import { createMarketApi } from './marketData'
import { proxyMarketRequest } from './marketProxy'
import { VPS_TOKEN_HEADER } from './vpsRelay'

const relay = { baseUrl: 'https://vps.example', token: 'test-relay-token' }
const request = (query = 'feed=sp500', method = 'GET') => new Request(`https://local/api/market?${query}`, { method })
const valuations = { result_code: 0, data: { items: [
  { index_code: 'SP500', pe: 25, pe_percentile: 0.5, ts: Date.parse('2026-10-15T00:00:00+08:00') },
  { index_code: 'NDX', pe: 30, pe_percentile: 0.4, ts: Date.parse('2026-10-15T00:00:00+08:00') },
] } }

afterEach(() => vi.unstubAllGlobals())

describe('美股指标 VPS 转发', () => {
  it('五个来源都转发到固定 VPS 端点，仅注入服务令牌并保留缓存头', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ from: 'vps' }, {
      headers: { 'cache-control': 'public, max-age=60, s-maxage=3600', 'set-cookie': 'private=value' },
    }))
    vi.stubGlobal('fetch', fetcher)
    for (const feed of ['sp500', 'nasdaq100', 'vix', 'valuations', 'fear-greed']) {
      const incoming = new Request(`https://local/api/market?feed=${feed}`, { headers: { cookie: 'browser=session', 'x-admin-token': 'admin' } })
      const result = await proxyMarketRequest(incoming, relay)
      expect(result.status).toBe(200)
      expect(await result.json()).toEqual({ from: 'vps' })
      expect(result.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=3600')
      expect(result.headers.has('set-cookie')).toBe(false)
      expect(fetcher).toHaveBeenLastCalledWith(`https://vps.example/api/market?feed=${feed}`, {
        headers: { [VPS_TOKEN_HEADER]: relay.token }, redirect: 'error', signal: expect.any(AbortSignal),
      })
    }
  })

  it('非法来源、重复参数和写请求在本地拒绝，不转发到 VPS', async () => {
    const fetcher = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetcher)
    for (const query of ['feed=other', 'feed=sp500&url=https://other.example', 'feed=sp500&feed=vix', '']) {
      expect((await proxyMarketRequest(request(query), relay)).status).toBe(400)
    }
    const result = await proxyMarketRequest(request('feed=sp500', 'POST'), relay)
    expect(result.status).toBe(405)
    expect(result.headers.get('allow')).toBe('GET')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('未配置 VPS 时仍由本地读取原来源', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(valuations))
    vi.stubGlobal('fetch', fetcher)
    vi.resetModules()
    const { proxyMarketRequest: direct } = await import('./marketProxy')
    const result = await direct(request('feed=valuations'), null)
    expect(result.status).toBe(200)
    expect(await result.json()).toMatchObject({ feed: 'valuations', indices: [{ index: 'sp500', pe: 25 }, { index: 'nasdaq100', pe: 30 }] })
    expect(fetcher).toHaveBeenCalledWith('https://danjuanfunds.com/djapi/index_eva/dj', expect.any(Object))
  })

  it('VPS 错误不缓存，恢复后重试生效，失败时不偷偷直连其他来源', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ error: 'unavailable' }, { status: 502, headers: { 'cache-control': 'public, max-age=3600' } }))
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(Response.json({ feed: 'sp500', bars: [] }))
    vi.stubGlobal('fetch', fetcher)
    for (let i = 0; i < 2; i++) {
      const result = await proxyMarketRequest(request(), relay)
      expect(result.status).toBe(502)
      expect(result.headers.get('cache-control')).toBe('no-store')
    }
    const recovered = await proxyMarketRequest(request(), relay)
    expect(recovered.status).toBe(200)
    expect(await recovered.json()).toEqual({ feed: 'sp500', bars: [] })
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(Array(3).fill('https://vps.example/api/market?feed=sp500'))
  })

  it('EdgeOne 从运行时 env 读取 VPS 配置，而非在边缘函数直连来源', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ feed: 'vix', bars: [] }))
    vi.stubGlobal('fetch', fetcher)
    const result = await onRequest({ request: request('feed=vix'), env: { TD_CACHE_URL: `${relay.baseUrl}/`, TD_CACHE_TOKEN: relay.token } })
    expect(result.status).toBe(200)
    expect(await result.json()).toEqual({ feed: 'vix', bars: [] })
    expect(fetcher).toHaveBeenCalledWith('https://vps.example/api/market?feed=vix', expect.objectContaining({ headers: { [VPS_TOKEN_HEADER]: relay.token } }))
  })

  it.each([
    { feed: 'valuations', payload: valuations, ttl: 6 * 60 * 60_000 },
    { feed: 'fear-greed', payload: { fear_and_greed: { score: 42, timestamp: '2026-10-15T22:00:00Z' } }, ttl: 30 * 60_000 },
  ])('$feed 的转发请求共用 VPS 缓存，按原 TTL 过期，无本地额外缓存', async ({ feed, payload, ttl }) => {
    const upstream = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(payload))
    let now = Date.parse('2026-10-16T00:00:00Z')
    const vps = createMarketApi(upstream, () => now)
    const forward = vi.fn<typeof fetch>().mockImplementation(async (input, init) => vps(new Request(input, init)))
    vi.stubGlobal('fetch', forward)
    const results = await Promise.all([
      proxyMarketRequest(request(`feed=${feed}`), relay),
      proxyMarketRequest(request(`feed=${feed}`), relay),
    ])
    expect(results.every((result) => result.status === 200)).toBe(true)
    expect(await results[0].json()).toEqual(await results[1].json())
    expect(forward).toHaveBeenCalledTimes(2)
    expect(upstream).toHaveBeenCalledTimes(1)
    now += ttl - 1
    expect((await proxyMarketRequest(request(`feed=${feed}`), relay)).status).toBe(200)
    expect(upstream).toHaveBeenCalledTimes(1)
    now += 2
    expect((await proxyMarketRequest(request(`feed=${feed}`), relay)).status).toBe(200)
    expect(upstream).toHaveBeenCalledTimes(2)
    expect(forward).toHaveBeenCalledTimes(4)
  })
})
