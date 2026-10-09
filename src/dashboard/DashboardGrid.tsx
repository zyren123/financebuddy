import { useEffect, useMemo, useState } from 'react'
import { GridLayout, useContainerWidth } from 'react-grid-layout'
import type { Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import { RANGE_OPTIONS } from '../charts/convert'
import type { RangeKey } from '../charts/convert'
import { CloseIcon, SlidersIcon, CheckIcon } from '../ui/icons'
import { CardSettings } from './CardSettings'
import { CardView } from './CardView'
import { cardTitle } from './types'
import type { CardConfig } from './types'

interface Props {
  cards: CardConfig[]
  layout: Layout
  editMode: boolean
  /** 窄屏:按网格阅读顺序单列堆叠,不走 RGL */
  stacked: boolean
  /** Browse State:浏览态的时间区间覆盖(会话内存,优先于卡片默认范围) */
  rangeOverride: Record<string, RangeKey>
  onLayoutChange: (layout: Layout) => void
  onCardChange: (id: string, patch: Partial<CardConfig>) => void
  onCardRemove: (id: string) => void
  /** 时间区间选择:编辑态改 Draft,浏览态改 Browse State(由上层决定) */
  onRangeSelect: (id: string, key: RangeKey) => void
}

const ROW_HEIGHT = 40
// 竖向间距会乘进每张卡的行高里(h 行 = h*rowHeight + (h-1)*margin),不宜过大
const MARGIN: [number, number] = [32, 20]
/** 单列堆叠时每类卡的高度(px) */
const STACK_HEIGHT: Record<CardConfig['kind'], number> = { candle: 420, ratioRoc: 380, indicator: 260 }

/** 浏览态看到的 range:Browse State 覆盖 > 卡片默认 */
function withRange(card: CardConfig, range: RangeKey): CardConfig {
  return { ...card, range } as CardConfig
}

/** RGL 网格 + 面板外壳(铜色顶线 / 标题 / 范围页签 / 编辑态按钮)。拖拽与缩放只在编辑模式开放。 */
export function DashboardGrid({
  cards,
  layout,
  editMode,
  stacked,
  rangeOverride,
  onLayoutChange,
  onCardChange,
  onCardRemove,
  onRangeSelect,
}: Props) {
  const { width, containerRef } = useContainerWidth()
  const [settingsOpenId, setSettingsOpenId] = useState<string | null>(null)

  // 离开编辑态时收起卡片设置(设置是编辑态专属入口)
  useEffect(() => {
    if (!editMode) setSettingsOpenId(null)
  }, [editMode])

  const panel = (card: CardConfig) => {
    const settingsOpen = settingsOpenId === card.id
    // 编辑态直接看卡片的默认范围(编辑它必须立刻可见);Browse State 只作用于浏览态
    const effectiveRange = editMode ? card.range : (rangeOverride[card.id] ?? card.range)
    return (
      <article
        className={`flex h-full flex-col border-t ${editMode ? 'border-dashed border-copper bg-void-raised/60' : 'border-copper-dim'}`}
        aria-label={cardTitle(card)}
      >
        <header
          className={`flex shrink-0 items-center justify-between gap-3 py-2.5 ${editMode ? 'card-drag-handle cursor-move px-2' : ''}`}
        >
          <h3 className="num truncate text-[12px] font-medium text-ink">{cardTitle(card)}</h3>
          <div className="flex shrink-0 items-center gap-1">
            {!settingsOpen && (
              <div className="num flex text-[11px]" role="group" aria-label="时间区间">
                {RANGE_OPTIONS.map((opt) => {
                  const on = effectiveRange === opt.key
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      aria-pressed={on}
                      className={`border-b px-1.5 py-1 transition-colors duration-150 ${
                        on ? 'border-copper text-ink' : 'border-transparent text-ink-faint hover:text-ink-muted'
                      }`}
                      onClick={() => onRangeSelect(card.id, opt.key)}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            )}
            {editMode && (
              <button
                type="button"
                className="p-1.5 text-ink-muted hover:text-ink"
                title="卡片设置(Ticker / 参数)"
                aria-label={settingsOpen ? '完成卡片设置' : '卡片设置'}
                onClick={() => setSettingsOpenId(settingsOpen ? null : card.id)}
              >
                {settingsOpen ? <CheckIcon /> : <SlidersIcon />}
              </button>
            )}
            {editMode && (
              <button
                type="button"
                className="p-1.5 text-ink-muted hover:text-down"
                title="删除卡片"
                aria-label="删除卡片"
                onClick={() => onCardRemove(card.id)}
              >
                <CloseIcon />
              </button>
            )}
          </div>
        </header>
        <div className={`relative min-h-0 flex-1 ${editMode ? 'px-2 pb-2' : ''}`}>
          {settingsOpen ? (
            <CardSettings card={card} onChange={(patch) => onCardChange(card.id, patch)} />
          ) : (
            <CardView card={withRange(card, effectiveRange)} />
          )}
        </div>
      </article>
    )
  }

  // 单列阅读顺序:先上后下、同行先左后右
  const ordered = useMemo(() => {
    const pos = new Map(layout.map((l) => [l.i, l]))
    return [...cards].sort((a, b) => {
      const pa = pos.get(a.id)
      const pb = pos.get(b.id)
      return (pa?.y ?? 0) - (pb?.y ?? 0) || (pa?.x ?? 0) - (pb?.x ?? 0)
    })
  }, [cards, layout])

  if (stacked) {
    return (
      <div className="flex flex-col gap-10">
        {ordered.map((card) => (
          <div key={card.id} style={{ height: STACK_HEIGHT[card.kind] }}>
            {panel(card)}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div ref={containerRef}>
      <GridLayout
        width={width}
        layout={layout}
        onLayoutChange={onLayoutChange}
        gridConfig={{ cols: 12, rowHeight: ROW_HEIGHT, margin: MARGIN, containerPadding: [0, 0], maxRows: Infinity }}
        dragConfig={{ enabled: editMode, handle: '.card-drag-handle', cancel: 'input, select, button' }}
        resizeConfig={{ enabled: editMode, handles: ['se'] }}
      >
        {cards.map((card) => (
          <div key={card.id}>{panel(card)}</div>
        ))}
      </GridLayout>
    </div>
  )
}
