import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DashboardState } from '../dashboard/types'
import { PRICE_ADJUSTMENT } from '../data/types'
import { useMarketReadings } from '../market/useMarketReadings'
import { FALLBACK_BASIS } from './basis'
import { buildSnapshot, ratioItems } from './compute'
import type { MarketInputs } from './compute'
import type { ReadingsSnapshot } from './model'
import { readingsQuery } from './query'
import { syntheticBars, syntheticPriceBars } from './testBars'
import { useCoverReadings } from './useCoverReadings'

function capture<T>(client: QueryClient, hook: () => T): T {
  let out: T | undefined
  function Probe() {
    out = hook()
    return null
  }
  renderToString(<QueryClientProvider client={client}><Probe /></QueryClientProvider>)
  return out as T
}

const bars = new Map([['VTV', syntheticBars(1)], ['QQQ', syntheticBars(2)], ['SCHD', syntheticBars(3)], ['CGDV', syntheticBars(4)]])
const noMarket: MarketInputs = { sp500: null, nasdaq100: null, vix: null, valuations: null, 'fear-greed': null }
const snapshot = buildSnapshot(bars, noMarket, FALLBACK_BASIS, 1)

function client(snap?: ReadingsSnapshot) {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  if (snap) c.setQueryData(readingsQuery.queryKey, snap)
  return c
}

const draft = (rocPeriod: number): DashboardState => ({
  version: 1,
  cards: [{ id: 'r', kind: 'ratioRoc', pairs: [{ numerator: 'VTV', denominator: 'QQQ' }], rocPeriod, range: '3y' }],
  layout: [],
})

describe('useCoverReadings', () => {
  it('布局未到时直接用快照,没有进度', () => {
    const r = capture(client(snapshot), () => useCoverReadings({ state: null, ready: false }))
    expect(r.readings.map((x) => x.label)).toEqual(['VTV/QQQ', 'SCHD/QQQ', 'CGDV/QQQ'])
    expect(r.progress).toBeNull()
    expect(r.date).toBe('2026-10-09')
    expect(r.period).toBe(35)
  })

  it('快照还在路上:不下载 K 线,也没有进度', () => {
    const r = capture(client(), () => useCoverReadings({ state: null, ready: false }))
    expect(r.readings).toEqual([])
    expect(r.progress).toBeNull()
    expect(r.error).toBeNull()
  })

  it('草稿口径与快照不同 → 本地按草稿计算,带进度', () => {
    const c = client(snapshot)
    const r0 = capture(c, () => useCoverReadings({ state: draft(20), ready: true }))
    expect(r0.progress).toEqual({ loaded: 0, total: 2 })
    expect(r0.readings).toEqual([])

    for (const s of ['VTV', 'QQQ']) c.setQueryData(['bars', PRICE_ADJUSTMENT, s, '1day'], bars.get(s))
    const r = capture(c, () => useCoverReadings({ state: draft(20), ready: true }))
    expect(r.progress).toEqual({ loaded: 2, total: 2 })
    expect(r.period).toBe(20)
    expect(r.readings.map((x) => x.label)).toEqual(['VTV/QQQ'])
    const [expected] = ratioItems(bars, { pairs: [{ numerator: 'VTV', denominator: 'QQQ' }], rocPeriod: 20 })
    expect(expected?.roc).toEqual({ status: 'ready', value: r.readings[0]!.value, date: r.readings[0]!.date })
  })
})

describe('useMarketReadings', () => {
  it('逐项映射快照;来源失败才提供重试', () => {
    const inputs: MarketInputs = { ...noMarket, vix: { feed: 'vix', bars: syntheticPriceBars(3) } }
    const m = capture(client(buildSnapshot(bars, inputs, FALLBACK_BASIS, 1)), () => useMarketReadings())
    expect(m.vix.kind).toBe('ready')
    expect(m.indices.sp500.rsi).toEqual({ kind: 'unavailable', label: '来源暂不可用' })
    expect(m.hasFailures).toBe(true)
  })

  it('快照在路上时全部 loading', () => {
    const m = capture(client(), () => useMarketReadings())
    expect(m.vix).toEqual({ kind: 'loading' })
    expect(m.hasFailures).toBe(false)
  })
})
