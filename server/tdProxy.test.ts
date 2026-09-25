import { afterEach, describe, expect, it, vi } from 'vitest'
import { proxyTwelveData } from './tdProxy'

const url = (query: string) => new URL(`http://localhost/api/td?${query}`)

function mockFetchOnce(status: number, body: string) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(body, { status, headers: { 'content-type': 'application/json' } }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('proxyTwelveData(共享核心)', () => {
  it('非白名单端点:404 且不打上游', async () => {
    const fetchMock = mockFetchOnce(200, '{}')
    const r = await proxyTwelveData(url('endpoint=price&symbol=QQQ'), 'k')
    expect(r.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('缺 apikey:500', async () => {
    mockFetchOnce(200, '{}')
    const r = await proxyTwelveData(url('endpoint=time_series&symbol=QQQ'), undefined)
    expect(r.status).toBe(500)
  })

  it('正常转发:上游 URL 去掉 endpoint 参数、拼上 apikey', async () => {
    const fetchMock = mockFetchOnce(200, '{"status":"ok","values":[]}')
    const r = await proxyTwelveData(url('endpoint=time_series&symbol=QQQ&interval=1day'), 'k1')
    expect(r.status).toBe(200)
    expect(r.body).toContain('"ok"')
    const upstream = fetchMock.mock.calls[0]![0] as string
    expect(upstream).toBe('https://api.twelvedata.com/time_series?symbol=QQQ&interval=1day&apikey=k1')
  })

  it('上游业务错误体:透传但绝不缓存', async () => {
    const fetchMock = mockFetchOnce(200, '{"code":429,"status":"error","message":"limit"}')
    const r1 = await proxyTwelveData(url('endpoint=time_series&symbol=ERR'), 'k')
    expect(r1.status).toBe(200)
    expect(r1.body).toContain('429')

    mockFetchOnce(200, '{"code":429,"status":"error","message":"limit"}')
    await proxyTwelveData(url('endpoint=time_series&symbol=ERR'), 'k')
    // 两次都真实打了上游(未缓存)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(0)
  })

  it('成功响应缓存 6h:同 query 二次请求不再打上游', async () => {
    const first = mockFetchOnce(200, '{"status":"ok","values":[1]}')
    const q = 'endpoint=time_series&symbol=CACHE&interval=1day'
    await proxyTwelveData(url(q), 'k')
    await proxyTwelveData(url(q), 'k')
    expect(first).toHaveBeenCalledTimes(1)
  })
})
