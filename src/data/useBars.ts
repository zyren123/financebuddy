import { queryOptions, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { barDateOf } from '../readings/query'
import { ensureBars, RESYNC_AFTER_MS } from './barsStore'
import { PRICE_ADJUSTMENT } from './types'
import type { Bar, Interval } from './types'

export function barsQuery(client: QueryClient, symbol: string, interval: Interval = '1day') {
  return queryOptions({
    queryKey: ['bars', PRICE_ADJUSTMENT, symbol, interval] as const,
    queryFn: () => ensureBars(symbol, interval, interval === '1day' ? barDateOf(client, symbol) : null),
    staleTime: RESYNC_AFTER_MS,
  })
}

export function isBehind(bars: Bar[] | undefined, notBefore: string | null): boolean {
  return !!bars && notBefore !== null && (bars.at(-1)?.datetime ?? '') < notBefore
}

export function useBars(symbol: string, interval: Interval = '1day') {
  return useQuery(barsQuery(useQueryClient(), symbol, interval))
}

/** 动态 symbol 列表(Ratio ROC 卡的分子分母集合) */
export function useBarsMany(symbols: string[], interval: Interval = '1day') {
  const client = useQueryClient()
  return useQueries({ queries: symbols.map((symbol) => barsQuery(client, symbol, interval)) })
}
