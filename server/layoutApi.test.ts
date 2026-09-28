import { describe, expect, it } from 'vitest'
import { PREV_KEY, PUBLISHED_KEY, handleLayoutRequest, type LayoutRequest, type LayoutStore } from './layoutApi'

class MemoryStore implements LayoutStore {
  map = new Map<string, string>()
  async get(key: string) {
    return this.map.get(key) ?? null
  }
  async put(key: string, value: string) {
    this.map.set(key, value)
  }
}

const TOKEN = 'secret-token'
const url = () => new URL('http://localhost/api/layout')

const req = (over: Partial<LayoutRequest> = {}): LayoutRequest => ({
  method: 'GET',
  url: url(),
  body: null,
  adminToken: TOKEN,
  ...over,
})

const validLayout = {
  version: 1,
  cards: [{ id: 'a', kind: 'candle', symbol: 'QQQ', range: '3y' }],
  layout: [{ i: 'a', x: 0, y: 0, w: 6, h: 10 }],
}

const put = (store: MemoryStore, body: unknown, token: string | null = TOKEN, adminTokenEnv: string | undefined = TOKEN) =>
  handleLayoutRequest(req({ method: 'PUT', body: JSON.stringify(body), adminToken: token }), store, adminTokenEnv)

describe('handleLayoutRequest(布局端点核心)', () => {
  it('GET 未发布:404', async () => {
    const r = await handleLayoutRequest(req(), new MemoryStore(), TOKEN)
    expect(r.status).toBe(404)
  })

  it('GET 已发布:200 且原样返回布局 JSON', async () => {
    const store = new MemoryStore()
    store.map.set(PUBLISHED_KEY, JSON.stringify(validLayout))
    const r = await handleLayoutRequest(req(), store, TOKEN)
    expect(r.status).toBe(200)
    expect(JSON.parse(r.body)).toEqual(validLayout)
  })

  it('路径不是 /api/layout:404', async () => {
    const r = await handleLayoutRequest(
      req({ url: new URL('http://localhost/api/other') }),
      new MemoryStore(),
      TOKEN,
    )
    expect(r.status).toBe(404)
  })

  it('PUT 缺令牌 / 令牌错误:401,且不写 store', async () => {
    const store = new MemoryStore()
    const noHeader = await put(store, validLayout, null)
    const wrong = await put(store, validLayout, 'wrong')
    expect(noHeader.status).toBe(401)
    expect(wrong.status).toBe(401)
    expect(store.map.size).toBe(0)
  })

  it('PUT 服务端未配置 ADMIN_TOKEN:500', async () => {
    const r = await handleLayoutRequest(
      req({ method: 'PUT', body: JSON.stringify(validLayout) }),
      new MemoryStore(),
      undefined,
    )
    expect(r.status).toBe(500)
  })

  it('PUT 非法布局(坏 JSON / 校验失败):400', async () => {
    const store = new MemoryStore()
    const badJson = await handleLayoutRequest(
      req({ method: 'PUT', body: '{not json', adminToken: TOKEN }),
      store,
      TOKEN,
    )
    const badLayout = await put(store, { version: 1, cards: [{ kind: 'candle' }] })
    expect(badJson.status).toBe(400)
    expect(badLayout.status).toBe(400)
    expect(store.map.size).toBe(0)
  })

  it('PUT 合法布局:200,写入规整后的 published;首次发布不产生 prev', async () => {
    const store = new MemoryStore()
    const r = await put(store, validLayout)
    expect(r.status).toBe(200)
    const stored = JSON.parse(store.map.get(PUBLISHED_KEY)!)
    expect(stored.cards[0].symbol).toBe('QQQ')
    expect(store.map.has(PREV_KEY)).toBe(false)
  })

  it('二次发布:旧版自动挪到 prev', async () => {
    const store = new MemoryStore()
    await put(store, validLayout)
    const second = { ...validLayout, cards: [...validLayout.cards, { id: 'b', kind: 'candle', symbol: 'SPY', range: '1y' }] }
    await put(store, second)
    const prev = JSON.parse(store.map.get(PREV_KEY)!)
    expect(prev.cards).toHaveLength(1)
    expect(JSON.parse(store.map.get(PUBLISHED_KEY)!).cards).toHaveLength(2)
  })

  it('POST verify:对令牌 200 / 错令牌 401', async () => {
    const store = new MemoryStore()
    const ok = await handleLayoutRequest(
      req({ method: 'POST', body: JSON.stringify({ action: 'verify' }) }),
      store,
      TOKEN,
    )
    const bad = await handleLayoutRequest(
      req({ method: 'POST', body: JSON.stringify({ action: 'verify' }), adminToken: 'nope' }),
      store,
      TOKEN,
    )
    expect(ok.status).toBe(200)
    expect(bad.status).toBe(401)
  })

  it('POST restore:有 prev 时交换 published 与 prev', async () => {
    const store = new MemoryStore()
    await put(store, validLayout)
    const second = { ...validLayout, cards: [...validLayout.cards, { id: 'b', kind: 'candle', symbol: 'SPY', range: '1y' }] }
    await put(store, second)

    const r = await handleLayoutRequest(
      req({ method: 'POST', body: JSON.stringify({ action: 'restore' }) }),
      store,
      TOKEN,
    )
    expect(r.status).toBe(200)
    const published = JSON.parse(store.map.get(PUBLISHED_KEY)!)
    const prev = JSON.parse(store.map.get(PREV_KEY)!)
    expect(published.cards).toHaveLength(1) // 回到第一版
    expect(prev.cards).toHaveLength(2) // "坏"的那版成了新的 prev(再 restore 可以来回切)
    // 响应直接带回恢复后的布局(最终一致性下客户端不回读)
    const payload = JSON.parse(r.body) as { layout?: { cards?: unknown[] } }
    expect(payload.layout?.cards).toHaveLength(1)
  })

  it('POST restore:无 prev → 404', async () => {
    const r = await handleLayoutRequest(
      req({ method: 'POST', body: JSON.stringify({ action: 'restore' }) }),
      new MemoryStore(),
      TOKEN,
    )
    expect(r.status).toBe(404)
  })

  it('POST 未知 action / 缺 body:400', async () => {
    const store = new MemoryStore()
    const unknown = await handleLayoutRequest(
      req({ method: 'POST', body: JSON.stringify({ action: 'explode' }) }),
      store,
      TOKEN,
    )
    const noBody = await handleLayoutRequest(req({ method: 'POST' }), store, TOKEN)
    expect(unknown.status).toBe(400)
    expect(noBody.status).toBe(400)
  })

  it('其他 method:405', async () => {
    const r = await handleLayoutRequest(req({ method: 'DELETE' }), new MemoryStore(), TOKEN)
    expect(r.status).toBe(405)
  })
})
