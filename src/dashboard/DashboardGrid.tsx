import { useState } from 'react'
import { GridLayout, useContainerWidth } from 'react-grid-layout'
import type { Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import { RANGE_OPTIONS } from '../charts/convert'
import { CardSettings } from './CardSettings'
import { CardView } from './CardView'
import { cardTitle } from './types'
import type { CardConfig } from './types'

interface Props {
  cards: CardConfig[]
  layout: Layout
  editMode: boolean
  onLayoutChange: (layout: Layout) => void
  onCardChange: (id: string, patch: Partial<CardConfig>) => void
  onCardRemove: (id: string) => void
}

/** RGL 网格 + 卡片外壳(标题栏 / 范围快捷键 / 编辑态按钮)。拖拽与缩放只在编辑模式开放。 */
export function DashboardGrid({
  cards,
  layout,
  editMode,
  onLayoutChange,
  onCardChange,
  onCardRemove,
}: Props) {
  const { width, containerRef } = useContainerWidth()
  const [settingsOpenId, setSettingsOpenId] = useState<string | null>(null)

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
                            card.range === opt.key ? 'bg-accent text-white' : 'bg-surface text-ink-muted hover:text-ink'
                          }`}
                          onClick={() => onCardChange(card.id, { range: opt.key } as Partial<CardConfig>)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {editMode && (
                    <>
                      <button
                        type="button"
                        className="px-1 text-ink-muted hover:text-ink"
                        title="卡片设置"
                        onClick={() => setSettingsOpenId(settingsOpen ? null : card.id)}
                      >
                        {settingsOpen ? '✓' : '⚙'}
                      </button>
                      <button
                        type="button"
                        className="px-1 text-ink-muted hover:text-down"
                        title="删除卡片"
                        onClick={() => onCardRemove(card.id)}
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
              </header>
              <div className="relative min-h-0 flex-1">
                {settingsOpen ? (
                  <CardSettings card={card} onChange={(patch) => onCardChange(card.id, patch)} />
                ) : (
                  <CardView card={card} />
                )}
              </div>
            </div>
          )
        })}
      </GridLayout>
    </div>
  )
}
