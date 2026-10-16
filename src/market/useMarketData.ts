import { useQueries } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'
import { MARKET_FEEDS } from './model'
import type { IndexId, MarketData, MarketFeed } from './model'
import { priceMetrics } from './metrics'
import { parseMarketData } from './schema'

export type Reading =
  | { kind: 'ready'; value: number; date: string }
  | { kind: 'loading' }
  | { kind: 'unavailable'; label: string }

type Query = UseQueryResult<MarketData, Error>
type Value = { value: number; date: string }

async function fetchMarket(feed: MarketFeed, signal: AbortSignal): Promise<MarketData> {
  const response = await fetch(`/api/market?feed=${feed}`, { signal })
  if (!response.ok) throw new Error('数据来源暂不可用')
  const raw: unknown = await response.json()
  return parseMarketData(feed, raw)
}

function reading(query: Query, value: Value | null): Reading {
  if (value) return { kind: 'ready', ...value }
  if (query.isPending) return { kind: 'loading' }
  return { kind: 'unavailable', label: query.isError ? '来源暂不可用' : '数据不足' }
}

function prices(query: Query) {
  const data = query.data
  const metrics = data && data.feed !== 'valuations' && data.feed !== 'fear-greed' ? priceMetrics(data.bars) : { rsi: null, drawdown: null }
  return { rsi: reading(query, metrics.rsi), drawdown: reading(query, metrics.drawdown) }
}

function valuations(query: Query, index: IndexId) {
  const data = query.data
  const row = data?.feed === 'valuations' ? data.indices.find((item) => item.index === index) : undefined
  return {
    pe: reading(query, row?.pe != null ? { value: row.pe, date: row.date } : null),
    percentile: reading(query, row?.percentile != null ? { value: row.percentile, date: row.date } : null),
  }
}

export function useMarketData(active: boolean) {
  const queries = useQueries({ queries: MARKET_FEEDS.map((feed) => ({
    queryKey: ['market', feed],
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchMarket(feed, signal),
    enabled: active,
    staleTime: feed === 'fear-greed' ? 30 * 60_000 : 6 * 60 * 60_000,
    retry: false,
  })) })
  const [sp500, nasdaq100, vix, valuation, fearGreed] = queries
  const vixData = vix.data
  const vixLast = vixData?.feed === 'vix' ? vixData.bars.at(-1) : undefined
  const fearData = fearGreed.data
  const failed = queries.filter((query) => query.isError)
  return {
    indices: {
      sp500: { ...prices(sp500), ...valuations(valuation, 'sp500') },
      nasdaq100: { ...prices(nasdaq100), ...valuations(valuation, 'nasdaq100') },
    },
    vix: reading(vix, vixLast ? { value: vixLast.close, date: vixLast.date } : null),
    fearGreed: reading(fearGreed, fearData?.feed === 'fear-greed' ? { value: fearData.score, date: fearData.date } : null),
    fetching: queries.some((query) => query.isFetching),
    hasFailures: failed.length > 0,
    retryFailures: () => Promise.all(failed.map((query) => query.refetch())),
  }
}
