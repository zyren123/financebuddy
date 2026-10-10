import { afterEach, describe, expect, it, vi } from 'vitest'
import { proxyTwelveData, upstreamFromEnv, type Upstream } from './tdProxy'

const url = (query: string) => new URL(`http://localhost/api/td?${query}`)
const direct = (apiKey: string | undefined): Upstream => ({ kind: 'direct', apiKey })

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
    const r = await proxyTwelveData(url('endpoint=price&symbol=QQQ'), direct('k'))
    expect(r.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('缺 apikey:500', async () => {
    mockFetchOnce(200, '{}')
    const r = await proxyTwelveData(url('endpoint=time_series&symbol=QQQ'), direct(undefined))
    expect(r.status).toBe(500)
  })

  it('正常转发:上游 URL 去掉 endpoint 参数、拼上 apikey', async () => {
    const fetchMock = mockFetchOnce(200, '{"status":"ok","values":[]}')
    const r = await proxyTwelveData(url('endpoint=time_series&symbol=QQQ&interval=1day'), direct('k1'))
    expect(r.status).toBe(200)
    expect(r.body).toContain('"ok"')
    const upstream = fetchMock.mock.calls[0]![0] as string
    expect(upstream).toBe('https://api.twelvedata.com/time_series?symbol=QQQ&interval=1day&apikey=k1')
  })

  it('上游业务错误体:透传但绝不缓存', async () => {
    const fetchMock = mockFetchOnce(200, '{"code":429,"status":"error","message":"limit"}')
    const r1 = await proxyTwelveData(url('endpoint=time_series&symbol=ERR'), direct('k'))
    expect(r1.status).toBe(200)
    expect(r1.body).toContain('429')

    mockFetchOnce(200, '{"code":429,"status":"error","message":"limit"}')
    await proxyTwelveData(url('endpoint=time_series&symbol=ERR'), direct('k'))
    // 两次都真实打了上游(未缓存)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(0)
  })

  it('成功响应缓存 6h:同 query 二次请求不再打上游', async () => {
    const first = mockFetchOnce(200, '{"status":"ok","values":[1]}')
    const q = 'endpoint=time_series&symbol=CACHE&interval=1day'
    await proxyTwelveData(url(q), direct('k'))
    await proxyTwelveData(url(q), direct('k'))
    expect(first).toHaveBeenCalledTimes(1)
  })
})

describe('upstreamFromEnv', () => {
  it('缺任一 TD_CACHE_* 变量:退回直连(合并后线上不突变)', () => {
    expect(upstreamFromEnv({ TWELVEDATA_API_KEY: 'k', TD_CACHE_URL: 'https://c' })).toEqual(direct('k'))
    expect(upstreamFromEnv({ TWELVEDATA_API_KEY: 'k', TD_CACHE_TOKEN: 't' })).toEqual(direct('k'))
  })
  it('两者都配:转发到 VPS,去掉末尾斜杠', () => {
    expect(upstreamFromEnv({ TD_CACHE_URL: 'https://c/', TD_CACHE_TOKEN: 't' })).toEqual({
      kind: 'relay',
      baseUrl: 'https://c',
      token: 't',
    })
  })
})

describe('proxyTwelveData 转发模式', () => {
  const relay: Upstream = { kind: 'relay', baseUrl: 'https://cache.example', token: 'secret' }

  it('原样转发 query 并带口令头,不需要 apikey,也不叠进程缓存', async () => {
    const fetchMock = mockFetchOnce(200, '{"status":"ok","values":[]}')
    const q = 'endpoint=time_series&symbol=RELAY&interval=1day'
    const r = await proxyTwelveData(url(q), relay)
    expect(r.status).toBe(200)
    const [target, init] = fetchMock.mock.calls[0]! as [string, RequestInit]
    expect(target).toBe(`https://cache.example/api/td?${q}`)
    expect(init.headers).toEqual({ 'x-td-cache-token': 'secret' })

    const second = mockFetchOnce(200, '{"status":"ok","values":[]}')
    await proxyTwelveData(url(q), relay)
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('白名单仍在边缘先挡', async () => {
    const fetchMock = mockFetchOnce(200, '{}')
    const r = await proxyTwelveData(url('endpoint=price&symbol=QQQ'), relay)
    expect(r.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('VPS 不可达:502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')))
    const r = await proxyTwelveData(url('endpoint=time_series&symbol=QQQ'), relay)
    expect(r.status).toBe(502)
  })
})
