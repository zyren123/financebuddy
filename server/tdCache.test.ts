import { afterEach, describe, expect, it, vi } from 'vitest'
import { UNLIMITED } from './credits'
import {
  createMemorySnapshotStore,
  createTdCache,
  FAILURE_COOLDOWN_MS,
  NOT_FOUND_COOLDOWN_MS,
  SNAPSHOT_TTL_MS,
  sliceSnapshot,
  type RawBar,
} from './tdCache'

// 新→旧,与上游一致
const bars = (dates: string[]): RawBar[] => dates.map((datetime) => ({ datetime, close: '1' }))
const FULL = bars(['2026-10-09', '2026-10-08', '2026-10-07', '2026-10-06', '2026-10-05'])

function stubUpstream(...responses: Array<{ status: number; body: unknown }>) {
  const fetchMock = vi.fn()
  for (const r of responses) {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(r.body), { status: r.status }))
  }
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const ok = { status: 200, body: { meta: { symbol: 'QQQ' }, values: FULL, status: 'ok' } }
const q = (query: string) => new URLSearchParams(`endpoint=time_series&${query}`)

afterEach(() => vi.unstubAllGlobals())

describe('createTdCache', () => {
  it('第 2…N 个访客(全量与各自不同的增量)上游调用 0 次', async () => {
    const fetchMock = stubUpstream(ok)
    const { handle } = createTdCache({ store: createMemorySnapshotStore(), apiKey: 'k', credits: UNLIMITED })

    const first = await handle(q('symbol=QQQ&interval=1day&outputsize=5000'))
    expect(first.outcome).toBe('miss')
    const visitors = await Promise.all([
      handle(q('symbol=QQQ&interval=1day&outputsize=5000')),
      handle(q('symbol=qqq&interval=1day&start_date=2026-10-08&end_date=2026-10-10&outputsize=5000')),
      handle(q('symbol=QQQ&interval=1day&start_date=2026-10-06&end_date=2026-10-10')),
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]![0]).toBe(
      'https://api.twelvedata.com/time_series?symbol=QQQ&interval=1day&outputsize=5000&adjust=splits&apikey=k',
    )
    expect(visitors.map((v) => v.outcome)).toEqual(['hit', 'hit', 'hit'])
    const dates = (r: { body: string }) => (JSON.parse(r.body) as { values: RawBar[] }).values.map((b) => b.datetime)
    expect(dates(visitors[1]!)).toEqual(['2026-10-09', '2026-10-08'])
    expect(dates(visitors[2]!)).toEqual(['2026-10-09', '2026-10-08', '2026-10-07', '2026-10-06'])
  })

  it('冷启动并发:同一 symbol 的多个首访只打一次上游', async () => {
    const fetchMock = stubUpstream(ok)
    const { handle } = createTdCache({ store: createMemorySnapshotStore(), apiKey: 'k', credits: UNLIMITED })
    const results = await Promise.all([1, 2, 3].map(() => handle(q('symbol=QQQ&interval=1day'))))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(results.every((r) => r.status === 200)).toBe(true)
  })

  it('不同 symbol 是不同快照', async () => {
    const fetchMock = stubUpstream(ok, ok)
    const { handle } = createTdCache({ store: createMemorySnapshotStore(), apiKey: 'k', credits: UNLIMITED })
    await handle(q('symbol=QQQ&interval=1day'))
    await handle(q('symbol=VTV&interval=1day'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('过期后刷新;刷新遇上游 429 回旧快照', async () => {
    let t = 0
    const limit = { status: 429, body: { code: 429, status: 'error', message: 'run out of credits' } }
    const fetchMock = stubUpstream(ok, limit)
    const { handle } = createTdCache({ store: createMemorySnapshotStore(), apiKey: 'k', now: () => t, credits: UNLIMITED })

    await handle(q('symbol=QQQ&interval=1day'))
    t = SNAPSHOT_TTL_MS + 1
    const r = await handle(q('symbol=QQQ&interval=1day&start_date=2026-10-09'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(r.status).toBe(200)
    expect(r.outcome).toBe('stale')
    expect(JSON.parse(r.body).values).toHaveLength(1)
  })

  it('symbol 不存在(code 400):原样透传,冷却 6h 不再烧 credit,之后重试', async () => {
    let t = 0
    const bad = { status: 200, body: { code: 400, status: 'error', message: 'symbol not found' } }
    const fetchMock = stubUpstream(bad, ok)
    const store = createMemorySnapshotStore()
    const { handle } = createTdCache({ store, apiKey: 'k', now: () => t, credits: UNLIMITED })
    const r1 = await handle(q('symbol=NOPE&interval=1day'))
    expect(r1.body).toContain('symbol not found')
    expect(await store.get('td:time_series:NOPE:1day:splits')).toBeNull()

    t = FAILURE_COOLDOWN_MS + 1
    expect((await handle(q('symbol=NOPE&interval=1day'))).body).toContain('symbol not found')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    t = NOT_FOUND_COOLDOWN_MS + 1
    const r3 = await handle(q('symbol=NOPE&interval=1day'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(r3.outcome).toBe('miss')
  })

  it('上游故障(5xx)只冷却 5 分钟', async () => {
    let t = 0
    const down = { status: 503, body: { error: 'bad gateway' } }
    const fetchMock = stubUpstream(down, ok)
    const { handle } = createTdCache({ store: createMemorySnapshotStore(), apiKey: 'k', now: () => t, credits: UNLIMITED })
    expect((await handle(q('symbol=QQQ&interval=1day'))).status).toBe(503)
    t = FAILURE_COOLDOWN_MS - 1
    await handle(q('symbol=QQQ&interval=1day'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    t = FAILURE_COOLDOWN_MS + 1
    expect((await handle(q('symbol=QQQ&interval=1day'))).outcome).toBe('miss')
  })

  it('当天额度用完:不打上游,回带 "for the day" 的 429,有旧快照回旧快照', async () => {
    let t = 0
    let left = 1
    const credits = { acquire: async () => left-- > 0 }
    const fetchMock = stubUpstream(ok)
    const { handle } = createTdCache({ store: createMemorySnapshotStore(), apiKey: 'k', now: () => t, credits })
    await handle(q('symbol=QQQ&interval=1day'))
    const fresh = await handle(q('symbol=VTV&interval=1day'))
    expect(fresh.status).toBe(429)
    expect(JSON.parse(fresh.body).message).toMatch(/for the day/)
    t = SNAPSHOT_TTL_MS + 1
    expect((await handle(q('symbol=QQQ&interval=1day'))).outcome).toBe('stale')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('bars():与浏览器同一份 adjust=all 快照,旧→新,命中不打上游', async () => {
    const fetchMock = stubUpstream(ok)
    const store = createMemorySnapshotStore()
    const td = createTdCache({ store, apiKey: 'k', credits: UNLIMITED })
    const bars = await td.bars('qqq')
    expect(bars?.map((b) => b.datetime)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'])
    expect(bars?.[0]).toMatchObject({ close: 1 })
    expect(new URL(fetchMock.mock.calls[0]![0]).searchParams.get('adjust')).toBe('all')
    expect(await store.get('td:time_series:QQQ:1day:all')).not.toBeNull()
    expect((await td.handle(q('symbol=QQQ&interval=1day&adjust=all'))).outcome).toBe('hit')
    await td.bars('QQQ')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('bars():过期刷新失败回旧快照;从未拉到过 → null', async () => {
    let t = 0
    const limit = { status: 429, body: { code: 429, status: 'error', message: 'run out of credits' } }
    stubUpstream(ok, limit, limit)
    const td = createTdCache({ store: createMemorySnapshotStore(), apiKey: 'k', now: () => t, credits: UNLIMITED })
    await td.bars('QQQ')
    t = SNAPSHOT_TTL_MS + 1
    expect(await td.bars('QQQ')).toHaveLength(5)
    expect(await td.bars('VTV')).toBeNull()
  })

  it('额度用完时有旧快照:冷却期内的访客都拿旧快照,上游只打一次', async () => {
    let t = 0
    const limit = { status: 429, body: { code: 429, status: 'error', message: 'run out of credits' } }
    const fetchMock = stubUpstream(ok, limit)
    const { handle } = createTdCache({ store: createMemorySnapshotStore(), apiKey: 'k', now: () => t, credits: UNLIMITED })
    await handle(q('symbol=QQQ&interval=1day'))
    t = SNAPSHOT_TTL_MS + 1
    const results = [await handle(q('symbol=QQQ&interval=1day')), await handle(q('symbol=QQQ&interval=1day'))]
    expect(results.map((r) => r.outcome)).toEqual(['stale', 'stale'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('存储写入失败:仍返回刚拿到的新数据', async () => {
    stubUpstream(ok)
    const store = { get: async () => null, set: async () => Promise.reject(new Error('redis down')) }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { handle } = createTdCache({ store, apiKey: 'k', credits: UNLIMITED })
    const r = await handle(q('symbol=QQQ&interval=1day'))
    expect(r.status).toBe(200)
    expect(r.outcome).toBe('miss')
  })

  it('区间内无数据:与上游一致返回业务错误', async () => {
    stubUpstream(ok)
    const { handle } = createTdCache({ store: createMemorySnapshotStore(), apiKey: 'k', credits: UNLIMITED })
    const r = await handle(q('symbol=QQQ&interval=1day&start_date=2026-10-10&end_date=2026-10-10'))
    expect(r.status).toBe(200)
    expect(JSON.parse(r.body)).toMatchObject({ code: 400, status: 'error' })
  })

  it('前复权不复用旧版快照,不同复权模式分别缓存和请求上游', async () => {
    const adjusted = { status: 200, body: { status: 'ok', values: [{ datetime: '2026-10-09', close: '90' }] } }
    const fetchMock = stubUpstream(adjusted, ok)
    const store = createMemorySnapshotStore()
    await store.set('td:time_series:QQQ:1day', { meta: null, values: [{ datetime: '2026-10-09', close: '999' }], fetchedAt: Date.now() })
    const { handle } = createTdCache({ store, apiKey: 'k', credits: UNLIMITED })
    const all = await handle(q('symbol=QQQ&interval=1day&adjust=all'))
    const splits = await handle(q('symbol=QQQ&interval=1day&adjust=splits'))
    expect(JSON.parse(all.body).values[0].close).toBe('90')
    expect(JSON.parse(splits.body).values[0].close).toBe('1')
    expect(await handle(q('symbol=QQQ&interval=1day&adjust=all'))).toMatchObject({ outcome: 'hit', body: all.body })
    expect(await handle(q('symbol=QQQ&interval=1day&adjust=splits'))).toMatchObject({ outcome: 'hit', body: splits.body })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('adjust')).toBe('all')
    expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get('adjust')).toBe('splits')
  })

  it.each([
    'symbol=QQQ&interval=1min',
    'symbol=QQQ&interval=1week',
    'symbol=QQQ&interval=1day&apikey=x',
    'symbol=QQQ&interval=1day&outputsize=0',
    'symbol=QQQ&interval=1day&start_date=yesterday',
    'symbol=QQQ&interval=1day&adjust=invalid',
    'symbol=QQQ&interval=1day&adjust=all&adjust=splits',
    'symbol=Q%20Q&interval=1day',
  ])('非法参数 %s:400 且不打上游', async (query) => {
    const fetchMock = stubUpstream(ok)
    const { handle } = createTdCache({ store: createMemorySnapshotStore(), apiKey: 'k', credits: UNLIMITED })
    const r = await handle(q(query))
    expect(r.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('sliceSnapshot(复刻上游 outputsize 截断语义)', () => {
  const query = { symbol: 'QQQ', interval: '1day', adjust: 'all', startDate: null, endDate: null } as const
  it('先按区间过滤(start 含、end 不含),再保留最新 N 根', () => {
    const r = sliceSnapshot(FULL, { ...query, startDate: '2026-10-05', endDate: '2026-10-08', outputsize: 2 })
    expect(r.map((b) => b.datetime)).toEqual(['2026-10-07', '2026-10-06'])
    const all = sliceSnapshot(FULL, { ...query, startDate: '2026-10-05', endDate: '2026-10-08', outputsize: null })
    expect(all.map((b) => b.datetime)).toEqual(['2026-10-07', '2026-10-06', '2026-10-05'])
  })
  it('无日期参数且未传 outputsize:默认 30', () => {
    const many = bars(Array.from({ length: 40 }, (_, i) => `2026-01-${String(40 - i).padStart(2, '0')}`))
    expect(sliceSnapshot(many, { ...query, outputsize: null })).toHaveLength(30)
  })
})
