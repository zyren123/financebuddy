import { useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { DashboardState } from '../dashboard/types'
import { barsQuery, isBehind } from '../data/useBars'
import { basisOf, symbolsOf } from './basis'
import { barDateOf, useReadingsSnapshot } from './query'

export function usePrefetchBars(state: DashboardState | null): void {
  const client = useQueryClient()
  const { data: snapshot } = useReadingsSnapshot()
  const symbols = useMemo(
    () => [...new Set([...Object.keys(snapshot?.bars ?? {}), ...(state ? symbolsOf(state, basisOf(state)) : [])])],
    [snapshot, state],
  )
  const symbolsKey = symbols.join(',')

  useEffect(() => {
    for (const symbol of symbols) {
      const options = barsQuery(client, symbol)
      void client
        .ensureQueryData(options)
        .then((bars) => (isBehind(bars, barDateOf(client, symbol)) ? client.fetchQuery({ ...options, staleTime: 0 }) : bars))
        .catch(() => {})
    }
  }, [client, symbolsKey, snapshot?.computedAt])
}
