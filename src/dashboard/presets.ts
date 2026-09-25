import type { Layout, LayoutItem } from 'react-grid-layout'
import type { CardConfig } from './types'

/** 布局预设(Q10 结论):四宫格 / 自上而下 */
export type PresetKey = 'quad' | 'flow'

const MIN = { minW: 3, minH: 4 }

/** 按预设重排:以卡片当前顺序为准,生成全新布局 */
export function layoutForPreset(preset: PresetKey, cards: CardConfig[]): Layout {
  if (preset === 'flow') {
    return cards.map((c, i) => ({ i: c.id, x: 0, y: i, w: 12, h: 9, ...MIN }))
  }
  return cards.map((c, i) => ({
    i: c.id,
    x: (i % 2) * 6,
    y: Math.floor(i / 2),
    w: 6,
    h: 10,
    ...MIN,
  }))
}

/** 布局与卡片集合对齐:补新增卡片的默认位,剔除孤儿项,保留用户摆过的位置 */
export function ensureLayout(cards: CardConfig[], layout: Layout): Layout {
  const existing = new Map(layout.map((item) => [item.i, item]))
  const out: LayoutItem[] = []
  let nextY = layout.reduce((max, item) => Math.max(max, item.y + item.h), 0)
  for (const card of cards) {
    const item = existing.get(card.id)
    if (item) {
      out.push({ ...MIN, ...item })
    } else {
      out.push({ i: card.id, x: 0, y: nextY, w: 12, h: 8, ...MIN })
      nextY += 8
    }
  }
  return out
}

export type { LayoutItem }
