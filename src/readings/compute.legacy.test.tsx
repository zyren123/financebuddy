import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Bar } from '../data/types'
import { PRICE_ADJUSTMENT } from '../data/types'
import { useRatioReadings } from '../data/useRatioReadings'
import type { RatioReading } from '../data/useRatioReadings'
import type { MarketData, MarketFeed } from '../market/model'
import { MARKET_FEEDS } from '../market/model'
import { useMarketData } from '../market/useMarketData'
import type { Reading } from '../market/useMarketData'
import { FALLBACK_BASIS } from './basis'
import { marketReadings, ratioItems } from './compute'
import type { MarketInputs } from './compute'
import type { Item } from './model'
import { syntheticBars, syntheticPriceBars } from './testBars'

function capture<T>(client: QueryClient, hook: () => T): T {
  let out: T | undefined
  function Probe() {
    out = hook()
    return null
  }
  renderToString(<QueryClientProvider client={client}><Probe /></QueryClientProvider>)
  return out as T
}

const quiet = () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })

function withBars(bars: Map<string, Bar[]>) {
  const client = quiet()
  for (const [symbol, data] of bars) client.setQueryData(['bars', PRICE_ADJUSTMENT, symbol, '1day'], data)
  return client
}

function withMarket(feeds: Partial<Record<MarketFeed, MarketData | Error>>) {
  const client = quiet()
  const cache = client.getQueryCache()
  for (const [feed, value] of Object.entries(feeds) as Array<[MarketFeed, MarketData | Error]>) {
    if (value instanceof Error) {
      cache.build(client, { queryKey: ['market', feed] }, {
        data: undefined, dataUpdateCount: 0, dataUpdatedAt: 0, error: value, errorUpdateCount: 1,
        errorUpdatedAt: Date.now(), fetchFailureCount: 1, fetchFailureReason: value, fetchMeta: null,
        isInvalidated: false, status: 'error', fetchStatus: 'idle',
      })
    } else {
      client.setQueryData(['market', feed], value)
    }
  }
  return client
}

const toLegacyRatio = (items: ReturnType<typeof ratioItems>): RatioReading[] =>
  items.flatMap((i) => i.roc.status === 'ready'
    ? [{ label: `${i.pair.numerator}/${i.pair.denominator}`, value: i.roc.value, previous: i.previous, date: i.roc.date }]
    : [])

const toLegacyReading = (item: Item): Reading => item.status === 'ready'
  ? { kind: 'ready', value: item.value, date: item.date }
  : { kind: 'unavailable', label: item.reason === 'source-down' ? '来源暂不可用' : '数据不足' }

function inputsOf(feeds: Partial<Record<MarketFeed, MarketData | Error>>): MarketInputs {
  const pick = (feed: MarketFeed) => {
    const v = feeds[feed]
    return v instanceof Error || v === undefined ? null : v
  }
  return Object.fromEntries(MARKET_FEEDS.map((f) => [f, pick(f)])) as MarketInputs
}

describe('与旧 hook 结果一致(删除旧 hook 前的对账)', () => {
  it.each([
    ['完整历史', (b: Bar[]) => b],
    ['够 ROC 不够前值', (b: Bar[]) => b.slice(-40)],
    ['不够 ROC', (b: Bar[]) => b.slice(-20)],
  ])('ratioItems ≡ useRatioReadings:%s', (_, cut) => {
    const bars = new Map(['VTV', 'QQQ', 'SCHD', 'CGDV'].map((s, i) => [s, cut(syntheticBars(i + 1))]))
    const legacy = capture(withBars(bars), () => useRatioReadings(FALLBACK_BASIS.pairs, FALLBACK_BASIS.rocPeriod))
    expect(legacy.loaded).toBe(4)
    expect(toLegacyRatio(ratioItems(bars, FALLBACK_BASIS))).toEqual(legacy.readings)
  })

  it.each([
    ['全部来源正常', {
      sp500: { feed: 'sp500', bars: syntheticPriceBars(1) },
      nasdaq100: { feed: 'nasdaq100', bars: syntheticPriceBars(2) },
      vix: { feed: 'vix', bars: syntheticPriceBars(3) },
      valuations: { feed: 'valuations', indices: [
        { index: 'sp500', date: '2026-10-09', pe: 25.1, percentile: 0 },
        { index: 'nasdaq100', date: '2026-10-09', pe: 30, percentile: 45 },
      ] },
      'fear-greed': { feed: 'fear-greed', score: 42, date: '2026-10-09' },
    }],
    ['部分来源失败、部分数据不足', {
      sp500: new Error('来源暂不可用'),
      nasdaq100: { feed: 'nasdaq100', bars: syntheticPriceBars(2, '2026-06-01') },
      vix: { feed: 'vix', bars: syntheticPriceBars(3) },
      valuations: { feed: 'valuations', indices: [{ index: 'nasdaq100', date: '2026-10-09', pe: null, percentile: 45 }] },
      'fear-greed': new Error('来源暂不可用'),
    }],
  ] as Array<[string, Partial<Record<MarketFeed, MarketData | Error>>]>)('marketReadings ≡ useMarketData:%s', (_, feeds) => {
    const legacy = capture(withMarket(feeds), () => useMarketData(false))
    const next = marketReadings(inputsOf(feeds))
    expect({
      indices: Object.fromEntries((['sp500', 'nasdaq100'] as const).map((index) => [index, Object.fromEntries(
        (['rsi', 'drawdown', 'pe', 'percentile'] as const).map((k) => [k, toLegacyReading(next.indices[index][k])]),
      )])),
      vix: toLegacyReading(next.vix),
      fearGreed: toLegacyReading(next.fearGreed),
    }).toEqual({ indices: legacy.indices, vix: legacy.vix, fearGreed: legacy.fearGreed })
  })
})
