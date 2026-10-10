import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemorySnapshotStore, createTdCache, SNAPSHOT_TTL_MS, sliceSnapshot, type RawBar } from './tdCache'

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
    const handle = createTdCache({ store: createMemorySnapshotStore(), apiKey: 'k' })

    const first = await handle(q('symbol=QQQ&interval=1day&outputsize=5000'))
    expect(first.outcome).toBe('miss')
    const visitors = await Promise.all([
      handle(q('symbol=QQQ&interval=1day&outputsize=5000')),
      handle(q('symbol=qqq&interval=1day&start_date=2026-10-08&end_date=2026-10-10&outputsize=5000')),
      handle(q('symbol=QQQ&interval=1day&start_date=2026-10-06&end_date=2026-10-10')),
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]![0]).toBe(
      'https://api.twelvedata.com/time_series?symbol=QQQ&interval=1day&outputsize=5000&apikey=k',
    )
    expect(visitors.map((v) => v.outcome)).toEqual(['hit', 'hit', 'hit'])
    const dates = (r: { body: string }) => (JSON.parse(r.body) as { values: RawBar[] }).values.map((b) => b.datetime)
    expect(dates(visitors[1]!)).toEqual(['2026-10-09', '2026-10-08'])
    expect(dates(visitors[2]!)).toEqual(['2026-10-09', '2026-10-08', '2026-10-07', '2026-10-06'])
  })

  it('冷启动并发:同一 symbol 的多个首访只打一次上游', async () => {
    const fetchMock = stubUpstream(ok)
    const handle = createTdCache({ store: createMemorySnapshotStore(), apiKey: 'k' })
    const results = await Promise.all([1, 2, 3].map(() => handle(q('symbol=QQQ&interval=1day'))))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(results.every((r) => r.status === 200)).toBe(true)
  })

  it('不同 interval 是不同快照', async () => {
    const fetchMock = stubUpstream(ok, ok)
    const handle = createTdCache({ store: createMemorySnapshotStore(), apiKey: 'k' })
    await handle(q('symbol=QQQ&interval=1day'))
    await handle(q('symbol=QQQ&interval=1week'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('过期后刷新;刷新遇上游 429 回旧快照', async () => {
    let t = 0
    const limit = { status: 429, body: { code: 429, status: 'error', message: 'run out of credits' } }
    const fetchMock = stubUpstream(ok, limit)
    const handle = createTdCache({ store: createMemorySnapshotStore(), apiKey: 'k', now: () => t })

    await handle(q('symbol=QQQ&interval=1day'))
    t = SNAPSHOT_TTL_MS + 1
    const r = await handle(q('symbol=QQQ&interval=1day&start_date=2026-10-09'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(r.status).toBe(200)
    expect(r.outcome).toBe('stale')
    expect(JSON.parse(r.body).values).toHaveLength(1)
  })

  it('无快照时上游错误原样透传且不缓存', async () => {
    const bad = { status: 200, body: { code: 400, status: 'error', message: 'symbol not found' } }
    const fetchMock = stubUpstream(bad, bad)
    const handle = createTdCache({ store: createMemorySnapshotStore(), apiKey: 'k' })
    const r1 = await handle(q('symbol=NOPE&interval=1day'))
    await handle(q('symbol=NOPE&interval=1day'))
    expect(r1.body).toContain('symbol not found')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('区间内无数据:与上游一致返回业务错误', async () => {
    stubUpstream(ok)
    const handle = createTdCache({ store: createMemorySnapshotStore(), apiKey: 'k' })
    const r = await handle(q('symbol=QQQ&interval=1day&start_date=2026-10-10&end_date=2026-10-10'))
    expect(r.status).toBe(200)
    expect(JSON.parse(r.body)).toMatchObject({ code: 400, status: 'error' })
  })

  it.each([
    'symbol=QQQ&interval=1min',
    'symbol=QQQ&interval=1day&apikey=x',
    'symbol=QQQ&interval=1day&outputsize=0',
    'symbol=QQQ&interval=1day&start_date=yesterday',
    'symbol=Q%20Q&interval=1day',
  ])('非法参数 %s:400 且不打上游', async (query) => {
    const fetchMock = stubUpstream(ok)
    const handle = createTdCache({ store: createMemorySnapshotStore(), apiKey: 'k' })
    const r = await handle(q(query))
    expect(r.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('sliceSnapshot(复刻上游 outputsize 截断语义)', () => {
  const query = { symbol: 'QQQ', interval: '1day' as const, startDate: null, endDate: null }
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
