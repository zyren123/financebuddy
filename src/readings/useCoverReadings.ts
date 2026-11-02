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
  value: number
  previous: number | null
  date: string
}

export interface CoverReadings {
  readings: RatioReading[]
  date: string | null
  error: Error | null
  progress: { loaded: number; total: number } | null
  period: number
}

const NO_BASIS: ReadingsBasis = { pairs: [], rocPeriod: FALLBACK_BASIS.rocPeriod }

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
  }, [dataKey, loaded, symbols, basis])
  return { items, error, progress: { loaded, total: symbols.length } }
}

function toReading({ pair, roc, previous }: RatioItem): RatioReading[] {
  if (roc.status !== 'ready') return []
  return [{ label: `${pair.numerator}/${pair.denominator}`, value: roc.value, previous, date: roc.date }]
}
