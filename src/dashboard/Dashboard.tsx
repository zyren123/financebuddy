import { useCallback, useEffect, useRef, useState } from 'react'
import { cardFactories } from './useDashboard'
import { useDashboard } from './useDashboard'
import { DashboardGrid } from './DashboardGrid'
import type { PresetKey } from './presets'

const btn =
  'rounded border border-edge px-2 py-1 text-[11px] text-ink-muted transition-colors hover:border-ink-muted hover:text-ink'
const btnPrimary = 'rounded bg-accent px-2 py-1 text-[11px] font-medium text-white hover:brightness-110'

/** 应用主体:顶栏(模式切换 / 预设 / 增删 / 导入导出)+ 卡片网格 */
export function Dashboard() {
  const { state, ready, updateCard, removeCard, addCard, applyPreset, setLayout, resetToPublished, importJson, exportJson } =
    useDashboard()
  const [editMode, setEditMode] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 快捷键 E:切换编辑模式(输入框内不触发)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return
      if (e.key === 'e' || e.key === 'E') setEditMode((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onImportFile = useCallback(
    async (file: File) => {
      try {
        importJson(await file.text())
      } catch (err) {
        alert(err instanceof Error ? err.message : '导入失败')
      }
    },
    [importJson],
  )

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-edge bg-surface-raised px-3 py-2">
        <span className="mr-1 text-sm font-semibold tracking-wide text-ink">FinanceBuddy</span>

        <button type="button" className={editMode ? btnPrimary : btn} onClick={() => setEditMode((v) => !v)}>
          {editMode ? '✓ 完成编辑' : '✎ 编辑布局(E)'}
        </button>

        {editMode && (
          <>
            <span className="mx-1 h-4 w-px bg-edge" aria-hidden />
            <div className="flex overflow-hidden rounded border border-edge text-[11px]">
              {(
                [
                  { key: 'quad', label: '四宫格' },
                  { key: 'flow', label: '自上而下' },
                ] as Array<{ key: PresetKey; label: string }>
              ).map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className="bg-surface px-2 py-1 text-ink-muted hover:text-ink"
                  onClick={() => applyPreset(p.key)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <span className="mx-1 h-4 w-px bg-edge" aria-hidden />
            <button type="button" className={btn} onClick={() => addCard(cardFactories.candle)}>
              + K 线卡
            </button>
            <button type="button" className={btn} onClick={() => addCard(cardFactories.ratioRoc)}>
              + Ratio ROC 卡
            </button>
            <button type="button" className={btn} onClick={() => addCard(cardFactories.indicator)}>
              + 指标卡
            </button>
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button type="button" className={btn} onClick={exportJson}>
            导出布局
          </button>
          <button type="button" className={btn} onClick={() => fileInputRef.current?.click()}>
            导入布局
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void onImportFile(file)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            className={btn}
            onClick={() => {
              if (confirm('重置为默认布局(Published Layout)?当前本地布局将被覆盖。')) void resetToPublished()
            }}
          >
            重置为默认
          </button>
        </div>
      </header>

      {ready && state ? (
        <DashboardGrid
          cards={state.cards}
          layout={state.layout}
          editMode={editMode}
          onLayoutChange={setLayout}
          onCardChange={updateCard}
          onCardRemove={removeCard}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-xs text-ink-muted">正在载入布局…</div>
      )}
    </div>
  )
}
