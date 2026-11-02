import { afterEach, describe, expect, it, vi } from 'vitest'
import { onRequest } from '../functions/api/readings/index'
import type { ReadingsService } from './readings'
import { READINGS_CACHE_CONTROL, handleReadingsRequest, proxyReadingsRequest } from './readingsApi'
import { VPS_TOKEN_HEADER } from './vpsRelay'

const relay = { baseUrl: 'https://vps.example', token: 'test-relay-token' }
const request = (query = '', method = 'GET') => new Request(`https://local/api/readings${query}`, { method })

function serviceOf(read: ReadingsService['read']): ReadingsService {
  return { read, refresh: async () => {}, start: () => () => {} }
}

afterEach(() => vi.unstubAllGlobals())

describe('handleReadingsRequest', () => {
  it('回快照原文并允许边缘缓存', async () => {
    const result = await handleReadingsRequest(request(), serviceOf(async () => '{"computedAt":1}'))
    expect(result.status).toBe(200)
    expect(await result.text()).toBe('{"computedAt":1}')
    expect(result.headers.get('cache-control')).toBe(READINGS_CACHE_CONTROL)
    expect(result.headers.get('content-type')).toContain('application/json')
  })

  it('从未算成功 → 503 且不缓存', async () => {
    const result = await handleReadingsRequest(request(), serviceOf(async () => { throw new Error('down') }))
    expect(result.status).toBe(503)
    expect(result.headers.get('cache-control')).toBe('no-store')
  })

  it('带参数或非 GET 不触达 service', async () => {
    const read = vi.fn<ReadingsService['read']>()
    expect((await handleReadingsRequest(request('?pairs=QQQ'), serviceOf(read))).status).toBe(400)
    const post = await handleReadingsRequest(request('', 'POST'), serviceOf(read))
    expect(post.status).toBe(405)
    expect(post.headers.get('allow')).toBe('GET')
    expect(read).not.toHaveBeenCalled()
  })
})

describe('proxyReadingsRequest', () => {
  it('转发到固定 VPS 端点,只注入服务令牌,成功时带回上游 cache-control', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"from":"vps"}', {
      headers: { 'content-type': 'application/json', 'cache-control': READINGS_CACHE_CONTROL, 'set-cookie': 'x=1' },
    }))
    vi.stubGlobal('fetch', fetcher)
    const incoming = new Request('https://local/api/readings', { headers: { cookie: 'browser=session' } })
    const result = await proxyReadingsRequest(incoming, relay, {})
    expect(result.status).toBe(200)
    expect(await result.text()).toBe('{"from":"vps"}')
    expect(result.headers.get('cache-control')).toBe(READINGS_CACHE_CONTROL)
    expect(result.headers.has('set-cookie')).toBe(false)
    expect(fetcher).toHaveBeenCalledWith('https://vps.example/api/readings', {
      headers: { [VPS_TOKEN_HEADER]: relay.token }, redirect: 'error', signal: expect.any(AbortSignal),
    })
  })

  it('VPS 错误响应不缓存,网络失败 → 502', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ error: 'not found' }, { status: 404, headers: { 'cache-control': 'public, max-age=3600' } }))
      .mockRejectedValueOnce(new TypeError('connect ECONNREFUSED')))
    const notFound = await proxyReadingsRequest(request(), relay, {})
    expect(notFound.status).toBe(404)
    expect(notFound.headers.get('cache-control')).toBe('no-store')
    const down = await proxyReadingsRequest(request(), relay, {})
    expect(down.status).toBe(502)
    expect(down.headers.get('cache-control')).toBe('no-store')
  })

  it('带参数或非 GET 在转发前拒绝', async () => {
    const fetcher = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetcher)
    expect((await proxyReadingsRequest(request('?x=1'), relay, {})).status).toBe(400)
    expect((await proxyReadingsRequest(request('', 'PUT'), relay, {})).status).toBe(405)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('EdgeOne 入口读 env 里的 TD_CACHE_* 转发', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetcher)
    const result = await onRequest({ request: request(), env: { TD_CACHE_URL: 'https://edge-vps.example/', TD_CACHE_TOKEN: 't' } })
    expect(result.status).toBe(200)
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://edge-vps.example/api/readings')
  })

  it('未配置 VPS 也没有 key 时由本进程算:Ratio 项 source-down,美股指标照常回自己的状态', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline')))
    const result = await proxyReadingsRequest(request(), null, {})
    expect(result.status).toBe(200)
    const snapshot = await result.json() as { ratios: Array<{ roc: { status: string; reason?: string } }>; market: { vix: { status: string } } }
    expect(snapshot.ratios.length).toBeGreaterThan(0)
    expect(snapshot.ratios.every((r) => r.roc.status === 'unavailable' && r.roc.reason === 'source-down')).toBe(true)
    expect(snapshot.market.vix.status).toBe('unavailable')
  })
})
