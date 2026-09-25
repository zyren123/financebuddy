import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Layout } from 'react-grid-layout'
import {
  exportDashboardFile,
  loadLocalDashboard,
  loadPublishedDashboard,
  saveLocalDashboard,
  validateDashboardState,
} from './persistence'
import { ensureLayout, layoutForPreset } from './presets'
import type { PresetKey } from './presets'
import { newCardId } from './types'
import type { CardConfig, DashboardState } from './types'

/**
 * Dashboard 状态唯一来源:Local Layout(localStorage)优先,
 * 首次访问回落到 Published Layout(随产物分发)。
 */
export function useDashboard() {
  const [state, setState] = useState<DashboardState | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    const local = loadLocalDashboard()
    if (local) {
      setState(local)
      setReady(true)
      return
    }
    loadPublishedDashboard()
      .then((published) => {
        if (!cancelled) setState(published)
      })
      .catch(() => {
        // 默认布局也读不到(极罕见):空面板,用户可手动加卡
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 任何变化即持久化为 Local Layout
  useEffect(() => {
    if (state) saveLocalDashboard(state)
  }, [state])

  const updateCard = useCallback((id: string, patch: Partial<CardConfig>) => {
    setState((prev) => {
      if (!prev) return prev
      const cards = prev.cards.map((c) => (c.id === id ? ({ ...c, ...patch } as CardConfig) : c))
      return { ...prev, cards }
    })
  }, [])

  const removeCard = useCallback((id: string) => {
    setState((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        cards: prev.cards.filter((c) => c.id !== id),
        layout: prev.layout.filter((item) => item.i !== id),
      }
    })
  }, [])

  const addCard = useCallback((factory: () => CardConfig) => {
    setState((prev) => {
      if (!prev) return prev
      const card = factory()
      const cards = [...prev.cards, card]
      return { ...prev, cards, layout: ensureLayout(cards, prev.layout) }
    })
  }, [])

  const applyPreset = useCallback((preset: PresetKey) => {
    setState((prev) => (prev ? { ...prev, layout: layoutForPreset(preset, prev.cards) } : prev))
  }, [])

  const setLayout = useCallback((layout: Layout) => {
    setState((prev) => (prev ? { ...prev, layout } : prev))
  }, [])

  const resetToPublished = useCallback(async () => {
    setState(await loadPublishedDashboard())
  }, [])

  const importJson = useCallback((text: string) => {
    const parsed = validateDashboardState(JSON.parse(text))
    if (!parsed) throw new Error('布局文件无法识别(需要 version 1 的 FinanceBuddy 导出)')
    setState(parsed)
  }, [])

  const exportJson = useCallback(() => {
    if (state) exportDashboardFile(state)
  }, [state])

  return useMemo(
    () => ({
      state,
      ready,
      updateCard,
      removeCard,
      addCard,
      applyPreset,
      setLayout,
      resetToPublished,
      importJson,
      exportJson,
    }),
    [state, ready, updateCard, removeCard, addCard, applyPreset, setLayout, resetToPublished, importJson, exportJson],
  )
}

// ---- 新卡片默认值 ----

export const cardFactories = {
  candle: () => ({ id: newCardId(), kind: 'candle', symbol: 'QQQ', range: '3y' }) as CardConfig,
  ratioRoc: () =>
    ({
      id: newCardId(),
      kind: 'ratioRoc',
      pairs: [{ numerator: 'VTV', denominator: 'QQQ' }],
      rocPeriod: 35,
      range: '3y',
    }) as CardConfig,
  indicator: () =>
    ({ id: newCardId(), kind: 'indicator', symbol: 'QQQ', indicator: 'rsi', period: 14, range: '3y' }) as CardConfig,
}
