import { describe, expect, it } from 'vitest'
import { FALLBACK_BASIS } from './basis'
import { buildSnapshot, marketReadings, ratioItems } from './compute'
import type { MarketInputs } from './compute'
import { parseReadingsSnapshot } from './schema'
import { syntheticBars, syntheticPriceBars } from './testBars'

const full = new Map([
  ['VTV', syntheticBars(1)],
  ['QQQ', syntheticBars(2)],
  ['SCHD', syntheticBars(3)],
  ['CGDV', syntheticBars(4)],
])

const allFeeds: MarketInputs = {
  sp500: { feed: 'sp500', bars: syntheticPriceBars(1) },
  nasdaq100: { feed: 'nasdaq100', bars: syntheticPriceBars(2) },
  vix: { feed: 'vix', bars: syntheticPriceBars(3) },
  valuations: { feed: 'valuations', indices: [
    { index: 'sp500', date: '2026-10-09', pe: 25.1, percentile: 0 },
    { index: 'nasdaq100', date: '2026-10-09', pe: 30, percentile: null },
  ] },
  'fear-greed': { feed: 'fear-greed', score: 0, date: '2026-10-09' },
}

describe('ratioItems', () => {
  it('一个 symbol 拉不到只让用到它的那对 source-down,其余照常', () => {
    const items = ratioItems(new Map([...full].filter(([s]) => s !== 'SCHD')), FALLBACK_BASIS)
    expect(items.map((i) => i.roc.status)).toEqual(['ready', 'unavailable', 'ready'])
    expect(items[1]).toEqual({ pair: FALLBACK_BASIS.pairs[1], roc: { status: 'unavailable', reason: 'source-down' }, previous: null })
    expect(items[0]!.roc).toMatchObject({ date: '2026-10-09' })
  })

  it('历史不够算 ROC → insufficient;够 ROC 不够前值 → previous 为 null', () => {
    const short = new Map([...full].map(([s, b]) => [s, b.slice(-30)]))
    expect(ratioItems(short, FALLBACK_BASIS).map((i) => i.roc)).toEqual(
      Array(3).fill({ status: 'unavailable', reason: 'insufficient' }),
    )
    const enough = new Map([...full].map(([s, b]) => [s, b.slice(-40)]))
    const items = ratioItems(enough, FALLBACK_BASIS)
    expect(items.every((i) => i.roc.status === 'ready' && i.previous === null)).toBe(true)
  })
})

describe('marketReadings', () => {
  it('feed 缺失 → 它的各项 source-down;feed 在但值缺 → insufficient;0 是有效读数', () => {
    const m = marketReadings({ ...allFeeds, sp500: null, 'fear-greed': null })
    expect(m.indices.sp500.rsi).toEqual({ status: 'unavailable', reason: 'source-down' })
    expect(m.indices.sp500.drawdown).toEqual({ status: 'unavailable', reason: 'source-down' })
    expect(m.indices.sp500.pe).toEqual({ status: 'ready', value: 25.1, date: '2026-10-09' })
    expect(m.indices.sp500.percentile).toEqual({ status: 'ready', value: 0, date: '2026-10-09' })
    expect(m.indices.nasdaq100.percentile).toEqual({ status: 'unavailable', reason: 'insufficient' })
    expect(m.fearGreed).toEqual({ status: 'unavailable', reason: 'source-down' })
    expect(marketReadings(allFeeds).fearGreed).toEqual({ status: 'ready', value: 0, date: '2026-10-09' })
  })
})

describe('buildSnapshot', () => {
  it('bars 记录每个拉到的 symbol 的最后日期;序列化后解析回原样', () => {
    const bars = new Map([...full, ['TLT', []]])
    const snapshot = buildSnapshot(bars, { ...allFeeds, vix: null }, FALLBACK_BASIS, 123)
    expect(snapshot.bars).toEqual({ VTV: '2026-10-09', QQQ: '2026-10-09', SCHD: '2026-10-09', CGDV: '2026-10-09' })
    expect(snapshot.rocPeriod).toBe(35)
    expect(parseReadingsSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot)
  })

  it('输入相同 → 只有 computedAt 不同', () => {
    const a = buildSnapshot(full, allFeeds, FALLBACK_BASIS, 1)
    const b = buildSnapshot(full, allFeeds, FALLBACK_BASIS, 2)
    expect({ ...a, computedAt: 0 }).toEqual({ ...b, computedAt: 0 })
  })
})

describe('parseReadingsSnapshot', () => {
  const good = JSON.parse(JSON.stringify(buildSnapshot(full, allFeeds, FALLBACK_BASIS, 1)))
  it.each([
    ['未知状态', (s: typeof good) => { s.market.vix = { status: 'loading' } }],
    ['未知原因', (s: typeof good) => { s.ratios[0].roc = { status: 'unavailable', reason: 'oops' } }],
    ['日期无效', (s: typeof good) => { s.market.vix.date = '2026-02-30' }],
    ['周期无效', (s: typeof good) => { s.rocPeriod = 0 }],
    ['bars 键非 Ticker', (s: typeof good) => { s.bars['<script>'] = '2026-10-09' }],
    ['缺 market', (s: typeof good) => { delete s.market }],
  ])('拒绝%s', (_, mutate) => {
    const copy = structuredClone(good)
    mutate(copy)
    expect(() => parseReadingsSnapshot(copy)).toThrow()
  })

  it('拒绝错误页', () => {
    expect(() => parseReadingsSnapshot('<html>502</html>')).toThrow()
  })
})
