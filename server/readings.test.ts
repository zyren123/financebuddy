import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { syntheticBars, weekdays } from '../src/readings/testBars'
import type { ReadingsSnapshot } from '../src/readings/model'
import { createCreditLimiter, UNLIMITED } from './credits'
import type { CreditLimiter } from './credits'
import { createMarketSource, createMemoryTextStore, marketKey } from './marketData'
import type { TextStore } from './marketData'
import { createReadingsService } from './readings'
import type { ReadingsDeps } from './readings'
import { createMemorySnapshotStore, createTdCache } from './tdCache'
import type { SnapshotStore } from './tdCache'

const NOW = Date.parse('2026-10-10T12:00:00Z')
const HALF_HOUR = 30 * 60_000
const seedOf = (symbol: string) => [...symbol].reduce((a, c) => a + c.charCodeAt(0), 0) % 7 + 1

function tdBody(symbol: string) {
  const values = syntheticBars(seedOf(symbol), '2025-06-02').reverse().map((b) => ({
    datetime: b.datetime, open: String(b.open), high: String(b.high), low: String(b.low), close: String(b.close), volume: '1000',
  }))
  return { meta: { symbol }, values, status: 'ok' }
}

function yahooBody(symbol: string) {
  const days = weekdays('2024-10-01', '2026-10-09')
  return { chart: { result: [{
    meta: { symbol, instrumentType: 'INDEX', currentTradingPeriod: { regular: { start: NOW / 1000 - 3600, end: NOW / 1000 - 60 } } },
    timestamp: days.map((d) => Date.parse(`${d}T14:30:00Z`) / 1000),
    indicators: { quote: [{ close: days.map((_, i) => 100 + Math.sin(i / 9) * 5), high: days.map((_, i) => 106 + Math.sin(i / 9) * 5) }] },
  }] } }
}

const valuationBody = { result_code: 0, data: { items: [
  { index_code: 'SP500', pe: 25.1, pe_percentile: 0.8, ts: Date.parse('2026-10-09T00:00:00+08:00') },
  { index_code: 'NDX', pe: 30, pe_percentile: 0.45, ts: Date.parse('2026-10-09T00:00:00+08:00') },
] } }
const cnnBody = { fear_and_greed: { score: 42, timestamp: '2026-10-09T22:00:00Z' } }

type Route = 'td' | 'yahoo' | 'danjuan' | 'cnn'
function routeOf(url: string): Route {
  if (url.includes('twelvedata')) return 'td'
  if (url.includes('yahoo')) return 'yahoo'
  if (url.includes('danjuan')) return 'danjuan'
  return 'cnn'
}

function fakeUpstream(broken: Set<string> = new Set()) {
  const calls: string[] = []
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    const route = routeOf(url)
    const symbol = route === 'td' ? new URL(url).searchParams.get('symbol')! : route === 'yahoo' ? decodeURIComponent(url.split('/chart/')[1]!.split('?')[0]!) : route
    calls.push(route === 'td' ? `td:${symbol}` : route === 'yahoo' ? `yahoo:${symbol}` : route)
    if (broken.has(symbol)) {
      return route === 'td'
        ? Response.json({ code: 400, status: 'error', message: '**symbol** not found' })
        : new Response('blocked', { status: 503 })
    }
    if (route === 'td') return Response.json(tdBody(symbol))
    if (route === 'yahoo') return Response.json(yahooBody(symbol))
    return Response.json(route === 'danjuan' ? valuationBody : cnnBody)
  })
  return { fetcher, calls }
}

interface World {
  snapshots: SnapshotStore
  text: TextStore
  layout: { value: string | null }
}

const newWorld = (): World => ({ snapshots: createMemorySnapshotStore(), text: createMemoryTextStore(), layout: { value: null } })

function wire(world: World, upstream: ReturnType<typeof fakeUpstream>, clock: { t: number }, credits: CreditLimiter = UNLIMITED) {
  vi.stubGlobal('fetch', upstream.fetcher)
  const td = createTdCache({ store: world.snapshots, apiKey: 'k', credits, now: () => clock.t })
  return createReadingsService({
    bars: td.bars,
    market: createMarketSource({ store: world.text, fetcher: upstream.fetcher, now: () => clock.t }).load,
    publishedLayout: async () => world.layout.value,
    now: () => clock.t,
  })
}

const parse = (json: string) => JSON.parse(json) as ReadingsSnapshot

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('createReadingsService', () => {
  it('首次并发读合并成一次计算:每个 symbol、每个来源只打一次上游;全部项 ready', async () => {
    const upstream = fakeUpstream()
    const service = wire(newWorld(), upstream, { t: NOW })
    const [a, b, c] = await Promise.all([service.read(), service.read(), service.read()])
    expect(a).toBe(b)
    expect(b).toBe(c)
    expect(upstream.calls.sort()).toEqual(['cnn', 'danjuan', 'td:CGDV', 'td:QQQ', 'td:SCHD', 'td:VTV', 'yahoo:^GSPC', 'yahoo:^NDX', 'yahoo:^VIX'])
    const snap = parse(a)
    expect(snap.ratios.map((r) => [`${r.pair.numerator}/${r.pair.denominator}`, r.roc.status])).toEqual([
      ['VTV/QQQ', 'ready'], ['SCHD/QQQ', 'ready'], ['CGDV/QQQ', 'ready'],
    ])
    expect(snap.bars).toEqual({ VTV: '2026-10-09', QQQ: '2026-10-09', SCHD: '2026-10-09', CGDV: '2026-10-09' })
    const m = snap.market
    expect([m.vix, m.fearGreed, ...Object.values(m.indices).flatMap((i) => Object.values(i))].every((i) => i.status === 'ready')).toBe(true)
    expect(m.fearGreed).toEqual({ status: 'ready', value: 42, date: '2026-10-09' })
  })

  it('stale-while-revalidate:30 分钟内不重算;过期先回旧快照,后台重算后才换新', async () => {
    const clock = { t: NOW }
    const service = wire(newWorld(), fakeUpstream(), clock)
    const first = parse(await service.read())
    clock.t += HALF_HOUR - 1
    expect(parse(await service.read()).computedAt).toBe(first.computedAt)
    clock.t += 2
    expect(parse(await service.read()).computedAt).toBe(first.computedAt)
    await vi.waitFor(async () => expect(parse(await service.read()).computedAt).toBe(clock.t))
  })

  it('部分失败:坏 symbol 只让用到它的 Ratio 不可用,CNN 挂了只让恐贪不可用', async () => {
    const service = wire(newWorld(), fakeUpstream(new Set(['SCHD', 'cnn'])), { t: NOW })
    const snap = parse(await service.read())
    expect(snap.ratios.map((r) => r.roc.status)).toEqual(['ready', 'unavailable', 'ready'])
    expect(snap.ratios[1]!.roc).toEqual({ status: 'unavailable', reason: 'source-down' })
    expect(snap.bars).not.toHaveProperty('SCHD')
    expect(snap.market.fearGreed).toEqual({ status: 'unavailable', reason: 'source-down' })
    expect(snap.market.vix.status).toBe('ready')
  })

  it('来源失败回存储里上次成功的值(带它自己的旧日期)', async () => {
    const world = newWorld()
    const clock = { t: NOW }
    await wire(world, fakeUpstream(), clock).refresh()
    clock.t += 31 * 60_000
    const later = wire(world, fakeUpstream(new Set(['cnn'])), clock)
    expect(parse(await later.read()).market.fearGreed).toEqual({ status: 'ready', value: 42, date: '2026-10-09' })
  })

  it('重启收敛:新进程读同一份存储,不打上游,数字与重启前相同', async () => {
    const world = newWorld()
    const clock = { t: NOW }
    const before = parse(await wire(world, fakeUpstream(), clock).read())
    clock.t += 60_000
    const upstream = fakeUpstream()
    const after = parse(await wire(world, upstream, clock).read())
    expect(upstream.calls).toEqual([])
    expect({ ...after, computedAt: 0 }).toEqual({ ...before, computedAt: 0 })
  })

  it('当天 credit 用完:拿到额度的 symbol 照常,其余 source-down,上游调用不超额', async () => {
    const upstream = fakeUpstream()
    const credits = createCreditLimiter({ perMinute: 100, perDay: 2 })
    const snap = parse(await wire(newWorld(), upstream, { t: NOW }, credits).read())
    expect(upstream.calls.filter((c) => c.startsWith('td:'))).toHaveLength(2)
    expect(Object.keys(snap.bars)).toHaveLength(2)
    expect(snap.ratios.some((r) => r.roc.status === 'unavailable')).toBe(true)
    expect(snap.market.vix.status).toBe('ready')
  })

  it('按已发布布局取口径与 symbol;布局坏掉回落出厂口径', async () => {
    const world = newWorld()
    world.layout.value = JSON.stringify({ version: 1, cards: [
      { id: 'a', kind: 'candle', symbol: 'tlt', range: '3y' },
      { id: 'b', kind: 'ratioRoc', pairs: [{ numerator: 'IWM', denominator: 'SPY' }], rocPeriod: 20, range: '3y' },
    ], layout: [] })
    const service = wire(world, fakeUpstream(), { t: NOW })
    const snap = parse(await service.read())
    expect(snap.rocPeriod).toBe(20)
    expect(snap.ratios.map((r) => r.pair)).toEqual([{ numerator: 'IWM', denominator: 'SPY' }])
    expect(Object.keys(snap.bars).sort()).toEqual(['IWM', 'SPY', 'TLT'])

    world.layout.value = '{not json'
    await service.refresh()
    expect(parse(await service.read()).rocPeriod).toBe(35)
  })

  it('计算进行中发布新布局:refresh 排一次跟进,按新布局算,不复用进行中的那次', async () => {
    const layouts = [
      Promise.withResolvers<string | null>(),
      Promise.withResolvers<string | null>(),
    ]
    let call = 0
    const deps: ReadingsDeps = {
      bars: async (s) => syntheticBars(seedOf(s)),
      market: async () => ({ sp500: null, nasdaq100: null, vix: null, valuations: null, 'fear-greed': null }),
      publishedLayout: () => layouts[call++]!.promise,
      now: () => NOW,
    }
    const service = createReadingsService(deps)
    const first = service.read()
    const followUp = service.refresh()
    layouts[0]!.resolve(null)
    expect(parse(await first).rocPeriod).toBe(35)
    await vi.waitFor(() => expect(call).toBe(2))
    layouts[1]!.resolve(JSON.stringify({ version: 1, cards: [
      { id: 'b', kind: 'ratioRoc', pairs: [{ numerator: 'IWM', denominator: 'SPY' }], rocPeriod: 20, range: '3y' },
    ], layout: [] }))
    await followUp
    expect(parse(await service.read()).rocPeriod).toBe(20)
  })

  it('整次计算失败:保留上一份快照;从未成功过 → read 抛', async () => {
    let layoutDown = true
    const deps: ReadingsDeps = {
      bars: async (s) => syntheticBars(seedOf(s)),
      market: async () => ({ sp500: null, nasdaq100: null, vix: null, valuations: null, 'fear-greed': null }),
      publishedLayout: async () => {
        if (layoutDown) throw new Error('redis down')
        return null
      },
      now: () => NOW,
    }
    const service = createReadingsService(deps)
    await expect(service.read()).rejects.toThrow('redis down')
    layoutDown = false
    const ok = await service.read()
    layoutDown = true
    await expect(service.refresh()).rejects.toThrow('redis down')
    expect(await service.read()).toBe(ok)
  })

  it('start():立即算一次,之后每 30 分钟一次;出错不停循环', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    let computes = 0
    let fail = false
    const service = createReadingsService({
      bars: async () => null,
      market: async () => ({ sp500: null, nasdaq100: null, vix: null, valuations: null, 'fear-greed': null }),
      publishedLayout: async () => {
        computes += 1
        if (fail) throw new Error('boom')
        return null
      },
    })
    const stop = service.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(computes).toBe(1)
    await vi.advanceTimersByTimeAsync(HALF_HOUR - 1)
    expect(computes).toBe(1)
    fail = true
    await vi.advanceTimersByTimeAsync(1)
    expect(computes).toBe(2)
    fail = false
    await vi.advanceTimersByTimeAsync(HALF_HOUR)
    expect(computes).toBe(3)
    stop()
    await vi.advanceTimersByTimeAsync(3 * HALF_HOUR)
    expect(computes).toBe(3)
  })
})

describe('createMarketSource', () => {
  it('各 feed 按自己的 TTL:CNN 30 分钟后重抓,其余 6 小时内命中存储', async () => {
    const clock = { t: NOW }
    const upstream = fakeUpstream()
    const store = createMemoryTextStore()
    const source = createMarketSource({ store, fetcher: upstream.fetcher, now: () => clock.t })
    await source.load()
    expect(upstream.calls).toHaveLength(5)
    clock.t += 30 * 60_000
    await source.load()
    expect(upstream.calls.slice(5)).toEqual(['cnn'])
    expect(JSON.parse((await store.get(marketKey('fear-greed')))!)).toMatchObject({ fetchedAt: clock.t, data: { feed: 'fear-greed', score: 42 } })
  })

  it('并发 load 合并成一次:每个来源只打一次上游', async () => {
    const upstream = fakeUpstream()
    const source = createMarketSource({ store: createMemoryTextStore(), fetcher: upstream.fetcher, now: () => NOW })
    const [a, b] = await Promise.all([source.load(), source.load()])
    expect(upstream.calls).toHaveLength(5)
    expect(b).toBe(a)
  })

  it('存储里的值形状不对就当作没有,重新抓上游;都失败 → null', async () => {
    const store = createMemoryTextStore()
    await store.put(marketKey('vix'), JSON.stringify({ data: { feed: 'sp500', bars: [] }, fetchedAt: NOW }))
    const upstream = fakeUpstream(new Set(['^VIX']))
    const inputs = await createMarketSource({ store, fetcher: upstream.fetcher, now: () => NOW }).load()
    expect(upstream.calls).toContain('yahoo:^VIX')
    expect(inputs.vix).toBeNull()
    expect(inputs.sp500?.feed).toBe('sp500')
  })
})
