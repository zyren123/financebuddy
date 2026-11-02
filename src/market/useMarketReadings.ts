import { useQueryClient } from '@tanstack/react-query'
import type { Item, UnavailableReason } from '../readings/model'
import { refetchReadingsFresh, useReadingsSnapshot } from '../readings/query'

export type Reading =
  | { kind: 'ready'; value: number; date: string }
  | { kind: 'loading' }
  | { kind: 'unavailable'; label: string }

const LABELS: Record<UnavailableReason, string> = { 'source-down': '来源暂不可用', insufficient: '数据不足' }

function toReading(item: Item | undefined, pending: boolean): Reading {
  if (item?.status === 'ready') return { kind: 'ready', value: item.value, date: item.date }
  if (item) return { kind: 'unavailable', label: LABELS[item.reason] }
  return pending ? { kind: 'loading' } : { kind: 'unavailable', label: LABELS['source-down'] }
}

export function useMarketReadings() {
  const query = useReadingsSnapshot()
  const client = useQueryClient()
  const market = query.data?.market
  const read = (item: Item | undefined) => toReading(item, query.isPending)
  const index = (id: 'sp500' | 'nasdaq100') => {
    const m = market?.indices[id]
    return { rsi: read(m?.rsi), drawdown: read(m?.drawdown), pe: read(m?.pe), percentile: read(m?.percentile) }
  }
  const items = market
    ? [...(['sp500', 'nasdaq100'] as const).flatMap((id) => Object.values(market.indices[id])), market.vix, market.fearGreed]
    : []
  return {
    indices: { sp500: index('sp500'), nasdaq100: index('nasdaq100') },
    vix: read(market?.vix),
    fearGreed: read(market?.fearGreed),
    fetching: query.isFetching,
    hasFailures: query.isError || items.some((item) => item.status === 'unavailable' && item.reason === 'source-down'),
    retryFailures: () => refetchReadingsFresh(client).catch(() => {}),
  }
}
