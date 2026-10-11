import { afterEach, describe, expect, it, vi } from 'vitest'
import { relayLayoutRequest, vpsRelayFromEnv } from './vpsRelay'

afterEach(() => vi.unstubAllGlobals())

const relay = { baseUrl: 'https://vps.example', token: 'relay-t' }

describe('vpsRelayFromEnv', () => {
  it('两个变量都有才转发,末尾斜杠去掉', () => {
    expect(vpsRelayFromEnv({ TD_CACHE_URL: 'https://vps.example/', TD_CACHE_TOKEN: 't' })).toEqual({
      baseUrl: 'https://vps.example',
      token: 't',
    })
    expect(vpsRelayFromEnv({ TD_CACHE_URL: 'https://vps.example' })).toBeNull()
    expect(vpsRelayFromEnv({ TD_CACHE_URL: '', TD_CACHE_TOKEN: 't' })).toBeNull()
  })
})

describe('relayLayoutRequest', () => {
  it('发布请求:方法、body、Admin 口令与转发口令都带到 VPS', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await relayLayoutRequest(relay, {
      method: 'PUT',
      url: new URL('https://site/api/layout'),
      body: '{"version":1}',
      adminToken: 'admin-t',
    })
    expect(r).toEqual({ status: 200, body: '{"ok":true}' })
    const [target, init] = fetchMock.mock.calls[0]! as [string, RequestInit]
    expect(target).toBe('https://vps.example/api/layout')
    expect(init.method).toBe('PUT')
    expect(init.body).toBe('{"version":1}')
    expect(init.headers).toMatchObject({ 'x-admin-token': 'admin-t', 'x-td-cache-token': 'relay-t' })
  })

  it('读取请求不带 Admin 口令头;VPS 的 404 原样透传(客户端回落出厂布局)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"error":"not published"}', { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await relayLayoutRequest(relay, {
      method: 'GET',
      url: new URL('https://site/api/layout'),
      body: null,
      adminToken: null,
    })
    expect(r.status).toBe(404)
    const init = fetchMock.mock.calls[0]![1] as RequestInit
    expect(init.headers).not.toHaveProperty('x-admin-token')
    expect(init.body).toBeUndefined()
  })

  it('VPS 不可达:502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    const r = await relayLayoutRequest(relay, {
      method: 'GET',
      url: new URL('https://site/api/layout'),
      body: null,
      adminToken: null,
    })
    expect(r.status).toBe(502)
  })
})
