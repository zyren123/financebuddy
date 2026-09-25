import { useQueries, useQuery } from '@tanstack/react-query'
import { ensureBars } from './barsStore'
import type { Interval } from './types'

/**
 * 卡片取 K 线的唯一入口:同 symbol+interval 的多张卡自动去重;
 * staleTime 与 barsStore 的 6h 重同步窗口对齐,过期后 queryFn 再走增量。
 */
export function useBars(symbol: string, interval: Interval = '1day') {
  return useQuery({
    queryKey: ['bars', symbol, interval],
    queryFn: () => ensureBars(symbol, interval),
    staleTime: 6 * 60 * 60 * 1000,
  })
}

/** 动态 symbol 列表(Ratio ROC 卡的分子分母集合) */
export function useBarsMany(symbols: string[], interval: Interval = '1day') {
  return useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ['bars', symbol, interval],
      queryFn: () => ensureBars(symbol, interval),
      staleTime: 6 * 60 * 60 * 1000,
    })),
  })
}
