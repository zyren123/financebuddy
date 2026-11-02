import { useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { DashboardState } from '../dashboard/types'
import { barsQuery, isBehind } from '../data/useBars'
import { basisOf, symbolsOf } from './basis'
import { barDateOf, useReadingsSnapshot } from './query'

/**
 * 页面一打开就在后台下载所有卡片的 K 线:快照里的 symbol(布局未到时就能开始)∪ 当前布局(含草稿新加的卡)。
 * 在途的同 symbol 请求被复用;复用到的那次若发起时还没有快照日期而仍落后,再强制拉一次。
 * 每次快照每个 symbol 最多多拉一次。错误吞掉,卡片自己的 useBars 会展示。
 */
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- symbolsKey 即 symbols 的内容;快照更新时重新核对
  }, [client, symbolsKey, snapshot?.computedAt])
}
