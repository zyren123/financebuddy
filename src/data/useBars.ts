import { queryOptions, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { barDateOf } from '../readings/query'
import { ensureBars } from './barsStore'
import { PRICE_ADJUSTMENT } from './types'
import type { Bar, Interval } from './types'

/**
 * 卡片、封面本地计算与开页预取共用的唯一 query 定义:同 symbol+interval 自动去重;
 * staleTime 与 barsStore 的 6h 完整快照刷新窗口对齐。
 * notBefore 在 queryFn 执行时才读,谁先发起都按同一条"与读数快照同一天"的规则。
 */
export function barsQuery(client: QueryClient, symbol: string, interval: Interval = '1day') {
  return queryOptions({
    queryKey: ['bars', PRICE_ADJUSTMENT, symbol, interval] as const,
    queryFn: () => ensureBars(symbol, interval, interval === '1day' ? barDateOf(client, symbol) : null),
    staleTime: 6 * 60 * 60 * 1000,
  })
}

/** 内存里的 K 线是否落后于服务端快照日期 */
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
