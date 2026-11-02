import { useMemo } from 'react'
import type { DashboardState } from '../dashboard/types'
import type { Bar } from '../data/types'
import { useBarsMany } from '../data/useBars'
import { basisOf, basisOfSnapshot, FALLBACK_BASIS, pairSymbols, sameBasis } from './basis'
import { ratioItems } from './compute'
import type { RatioItem, ReadingsBasis } from './model'
import { useReadingsSnapshot } from './query'

export interface RatioReading {
  label: string
  /** 最新收盘日的 Ratio ROC(%) */
  value: number
  /** N 个交易日前的读数,画成幽灵径迹;序列不够长时为 null */
  previous: number | null
  date: string
}

export interface CoverReadings {
  /** 只含 ready 的项;非空即 fired(探测器与 CountUp 从这一刻开始) */
  readings: RatioReading[]
  /** 所有读数中最新的收盘日 */
  date: string | null
  /** 一项都拿不到时才非空 */
  error: Error | null
  /** 只在本地计算(草稿 / 快照口径不符 / 快照不可用)时存在;快照模式没有"x/y" */
  progress: { loaded: number; total: number } | null
  /** 当前口径的 ROC 周期 */
  period: number
}

const NO_BASIS: ReadingsBasis = { pairs: [], rocPeriod: FALLBACK_BASIS.rocPeriod }

/**
 * 口径:布局就绪用 basisOf(dashboard.state)(编辑中即草稿);布局未到信快照自己的口径。
 * 数字:快照口径一致且至少一项 ready → 快照;快照还在路上 → 不下载 K 线;
 * 其余 → 本地 useBarsMany + ratioItems,与服务端同一份计算。
 */
export function useCoverReadings(dashboard: { state: DashboardState | null; ready: boolean }): CoverReadings {
  const snapshot = useReadingsSnapshot()
  const snap = snapshot.data
  const wanted = useMemo(() => (dashboard.ready ? basisOf(dashboard.state) : null), [dashboard.ready, dashboard.state])
  const basis = wanted ?? (snap ? basisOfSnapshot(snap) : FALLBACK_BASIS)
  const fromSnapshot = !!snap
    && (wanted === null || sameBasis(wanted, basisOfSnapshot(snap)))
    && snap.ratios.some((r) => r.roc.status === 'ready')
  const local = useLocalRatioItems(!snapshot.isPending && !fromSnapshot ? basis : NO_BASIS)
  const localActive = !snapshot.isPending && !fromSnapshot

  const items = fromSnapshot ? snap.ratios : local.items
  const readings = useMemo(() => items.flatMap(toReading), [items])
  const date = readings.map((r) => r.date).sort().at(-1) ?? null
  const error = readings.length > 0 ? null : (local.error ?? (localActive ? null : snapshot.error))
  return { readings, date, error, progress: localActive ? local.progress : null, period: basis.rocPeriod }
}

function useLocalRatioItems(basis: ReadingsBasis) {
  const symbols = useMemo(() => pairSymbols(basis), [basis])
  const results = useBarsMany(symbols)
  const loaded = results.filter((r) => r.data).length
  const error = results.find((r) => r.error)?.error ?? null
  const dataKey = results.map((r) => r.dataUpdatedAt).join('|')
  const items = useMemo((): RatioItem[] => {
    if (symbols.length === 0 || loaded < symbols.length) return []
    const bySymbol = new Map<string, Bar[]>(symbols.map((s, i) => [s, results[i]?.data ?? []]))
    return ratioItems(bySymbol, basis)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dataKey 即 results 的数据版本
  }, [dataKey, loaded, symbols, basis])
  return { items, error, progress: { loaded, total: symbols.length } }
}

function toReading({ pair, roc, previous }: RatioItem): RatioReading[] {
  if (roc.status !== 'ready') return []
  return [{ label: `${pair.numerator}/${pair.denominator}`, value: roc.value, previous, date: roc.date }]
}
