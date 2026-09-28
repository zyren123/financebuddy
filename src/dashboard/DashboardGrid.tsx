import { useEffect, useState } from 'react'
import { GridLayout, useContainerWidth } from 'react-grid-layout'
import type { Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import { RANGE_OPTIONS } from '../charts/convert'
import type { RangeKey } from '../charts/convert'
import { CardSettings } from './CardSettings'
import { CardView } from './CardView'
import { cardTitle } from './types'
import type { CardConfig } from './types'

interface Props {
  cards: CardConfig[]
  layout: Layout
  editMode: boolean
  /** Browse State:浏览态的时间区间覆盖(会话内存,优先于卡片默认范围) */
  rangeOverride: Record<string, RangeKey>
  onLayoutChange: (layout: Layout) => void
  onCardChange: (id: string, patch: Partial<CardConfig>) => void
  onCardRemove: (id: string) => void
  /** 时间区间选择:编辑态改 Draft,浏览态改 Browse State(由上层决定) */
  onRangeSelect: (id: string, key: RangeKey) => void
}

/** 浏览态看到的 range:Browse State 覆盖 > 卡片默认 */
function withRange(card: CardConfig, range: RangeKey): CardConfig {
  return { ...card, range } as CardConfig
}

/** RGL 网格 + 卡片外壳(标题栏 / 范围快捷键 / 编辑态按钮)。拖拽与缩放只在编辑模式开放。 */
export function DashboardGrid({
  cards,
  layout,
  editMode,
  rangeOverride,
  onLayoutChange,
  onCardChange,
  onCardRemove,
  onRangeSelect,
}: Props) {
  const { width, containerRef } = useContainerWidth()
  const [settingsOpenId, setSettingsOpenId] = useState<string | null>(null)

  // 离开编辑态时收起卡片设置(⚙ 是编辑态专属入口)
  useEffect(() => {
    if (!editMode) setSettingsOpenId(null)
  }, [editMode])

  return (
    <div ref={containerRef} className="min-h-0 flex-1 overflow-auto p-2">
      <GridLayout
        width={width}
        layout={layout}
        onLayoutChange={onLayoutChange}
        gridConfig={{ cols: 12, rowHeight: 40, margin: [8, 8], containerPadding: null, maxRows: Infinity }}
        dragConfig={{ enabled: editMode, handle: '.card-drag-handle', cancel: 'input, select, button' }}
        resizeConfig={{ enabled: editMode, handles: ['se'] }}
      >
        {cards.map((card) => {
          const settingsOpen = settingsOpenId === card.id
          // 编辑态直接看卡片的默认范围(编辑它必须立刻可见);Browse State 只作用于浏览态
          const effectiveRange = editMode ? card.range : (rangeOverride[card.id] ?? card.range)
          return (
            <div
              key={card.id}
              className={`flex h-full flex-col overflow-hidden rounded-md border bg-surface-raised ${
                editMode ? 'border-dashed border-accent/60' : 'border-edge'
              }`}
            >
              <header
                className={`flex shrink-0 items-center justify-between gap-2 border-b border-edge px-2 py-1 ${
                  editMode ? 'card-drag-handle cursor-move' : ''
                }`}
              >
                <span className="truncate text-[11px] font-medium text-ink">{cardTitle(card)}</span>
                <div className="flex shrink-0 items-center gap-1">
                  {!settingsOpen && (
                    <div className="flex overflow-hidden rounded border border-edge text-[10px]">
                      {RANGE_OPTIONS.map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          className={`px-1.5 py-0.5 ${
                            effectiveRange === opt.key
                              ? 'bg-accent text-white'
                              : 'bg-surface text-ink-muted hover:text-ink'
                          }`}
                          onClick={() => onRangeSelect(card.id, opt.key)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {editMode && (
                    <button
                      type="button"
                      className="px-1 text-ink-muted hover:text-ink"
                      title="卡片设置(Ticker / 参数)"
                      onClick={() => setSettingsOpenId(settingsOpen ? null : card.id)}
                    >
                      {settingsOpen ? '✓' : '⚙'}
                    </button>
                  )}
                  {editMode && (
                    <button
                      type="button"
                      className="px-1 text-ink-muted hover:text-down"
                      title="删除卡片"
                      onClick={() => onCardRemove(card.id)}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </header>
              <div className="relative min-h-0 flex-1">
                {settingsOpen ? (
                  <CardSettings card={card} onChange={(patch) => onCardChange(card.id, patch)} />
                ) : (
                  <CardView card={withRange(card, effectiveRange)} />
                )}
              </div>
            </div>
          )
        })}
      </GridLayout>
    </div>
  )
}
