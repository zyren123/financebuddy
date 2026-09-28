import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Layout } from 'react-grid-layout'
import {
  clearDraft,
  exportDashboardFile,
  loadDraft,
  loadPublishedLayout,
  publishLayout,
  restorePreviousLayout,
  saveDraft,
} from './persistence'
import { validateDashboardState } from './schema'
import { ensureLayout, layoutForPreset } from './presets'
import type { PresetKey } from './presets'
import { newCardId } from './types'
import type { CardConfig, DashboardState } from './types'


/**
 * Dashboard 状态唯一来源(ADR-0003):
 *   - published:读取链 服务端 Published Layout → Factory Layout 兜底;
 *   - Draft:仅 Admin 编辑期间存在(会话级),一切 mutation 只写 Draft;
 *   - 写入服务端的唯一入口是显式 publish / restore——纯渲染、纯浏览永不落盘。
 */
export function useDashboard(adminToken: string | null) {
  const [published, setPublished] = useState<DashboardState | null>(null)
  const [ready, setReady] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [draft, setDraft] = useState<DashboardState | null>(null)
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [publishing, setPublishing] = useState(false)

  useEffect(() => {
    let cancelled = false
    void loadPublishedLayout().then((state) => {
      if (cancelled) return
      if (state) setPublished(state)
      else setLoadFailed(true)
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Draft 会话级持久化:编辑期间的改动随时存 sessionStorage(发布/放弃后清除)
  useEffect(() => {
    if (draft) saveDraft(draft)
  }, [draft])

  // 渲染用视图:编辑期间看 Draft,其余看 Published
  const state = editing && draft ? draft : published

  const beginEditing = useCallback(() => {
    // 布局未就绪/读取失败时不开编辑:防止从空草稿开始,发布把所有访客的布局清成空白
    if (published == null) return
    setDraft(loadDraft() ?? published)
    setDirty(false)
    setEditing(true)
  }, [published])

  const finishEditing = useCallback(() => {
    // Draft 留在 sessionStorage:同一会话再进入编辑可继续;未发布就不生效
    setEditing(false)
  }, [])

  const discardDraft = useCallback(() => {
    setDraft(null)
    clearDraft()
    setDirty(false)
    setEditing(false)
  }, [])

  const publish = useCallback(async () => {
    if (!draft || !adminToken || publishing) return
    setPublishing(true)
    try {
      await publishLayout(draft, adminToken)
      setPublished(draft)
      setDraft(null)
      clearDraft()
      setDirty(false)
      setEditing(false)
    } finally {
      setPublishing(false)
    }
  }, [draft, adminToken, publishing])

  const restorePrevious = useCallback(async () => {
    if (!adminToken) return
    // 服务端在恢复响应里直接带回恢复后的布局(EdgeOne KV 最终一致性下立即回读可能拿到旧值)
    const restored = await restorePreviousLayout(adminToken)
    if (restored) {
      setPublished(restored)
      setLoadFailed(false)
    }
    setDraft(null)
    clearDraft()
    setDirty(false)
    setEditing(false)
  }, [adminToken])

  // ---- 以下 mutation 只作用于 Draft(仅 Admin 编辑期间可触达)----

  const updateCard = useCallback((id: string, patch: Partial<CardConfig>) => {
    setDraft((prev) => {
      if (!prev) return prev
      const cards = prev.cards.map((c) => (c.id === id ? ({ ...c, ...patch } as CardConfig) : c))
      return { ...prev, cards }
    })
    setDirty(true)
  }, [])

  const removeCard = useCallback((id: string) => {
    setDraft((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        cards: prev.cards.filter((c) => c.id !== id),
        layout: prev.layout.filter((item) => item.i !== id),
      }
    })
    setDirty(true)
  }, [])

  const addCard = useCallback((factory: () => CardConfig) => {
    setDraft((prev) => {
      if (!prev) return prev
      const card = factory()
      const cards = [...prev.cards, card]
      return { ...prev, cards, layout: ensureLayout(cards, prev.layout) }
    })
    setDirty(true)
  }, [])

  const applyPreset = useCallback((preset: PresetKey) => {
    setDraft((prev) => (prev ? { ...prev, layout: layoutForPreset(preset, prev.cards) } : prev))
    setDirty(true)
  }, [])

  // 直读已提交的 draft 再比对:不能把比对放进 setState updater 里等延迟执行,
  // 否则拖拽连发的回调可能读不到已变更的 draft,dirty 永远置不上
  const setLayout = useCallback(
    (layout: Layout) => {
      if (!draft) return
      // RGL 挂载/规整的空回调(内容等价)不算编辑
      if (JSON.stringify(draft.layout) === JSON.stringify(layout)) return
      setDraft({ ...draft, layout })
      setDirty(true)
    },
    [draft],
  )

  /** 导入文件:校验后载入 Draft,发布才对访客生效 */
  const importJson = useCallback((text: string) => {
    const parsed = validateDashboardState(JSON.parse(text))
    if (!parsed) throw new Error('布局文件无法识别(需要 version 1 的 FinanceBuddy 导出)')
    setDraft(parsed)
    setDirty(true)
  }, [])

  /** 导出:编辑态导 Draft,浏览态导当前 Published(备份闭环,见 ADR-0003) */
  const exportJson = useCallback(() => {
    if (state) exportDashboardFile(state)
  }, [state])

  return useMemo(
    () => ({
      state,
      ready,
      loadFailed,
      editing,
      dirty,
      publishing,
      beginEditing,
      finishEditing,
      discardDraft,
      publish,
      restorePrevious,
      updateCard,
      removeCard,
      addCard,
      applyPreset,
      setLayout,
      importJson,
      exportJson,
    }),
    [
      state,
      ready,
      loadFailed,
      editing,
      dirty,
      publishing,
      beginEditing,
      finishEditing,
      discardDraft,
      publish,
      restorePrevious,
      updateCard,
      removeCard,
      addCard,
      applyPreset,
      setLayout,
      importJson,
      exportJson,
    ],
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
