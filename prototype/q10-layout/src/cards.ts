// ── 卡片清单(三种 Card 类型见仓库根 CONTEXT.md)──
// 顺序即 B 布局(自动流式)的排列顺序。
import { BARS, type TickerKey } from './mock/data'
import { ratioRoc, rsi, roc, type Point } from './mock/indicators'
import { COLORS } from './theme'

export type CardKind = 'candle' | 'ratioRoc' | 'rsi' | 'roc'

export interface CardDef {
  id: string
  kind: CardKind
  title: string
  subtitle: string
  ticker?: TickerKey
}

export const CARDS: CardDef[] = [
  { id: 'qqq-candle', kind: 'candle', ticker: 'QQQ', title: 'QQQ', subtitle: 'K 线卡 · 日线' },
  { id: 'ratio-roc', kind: 'ratioRoc', title: 'Ratio ROC (35)', subtitle: 'Ratio ROC 卡' },
  { id: 'qqq-rsi', kind: 'rsi', ticker: 'QQQ', title: 'QQQ · RSI (14)', subtitle: '指标卡' },
  { id: 'schd-candle', kind: 'candle', ticker: 'SCHD', title: 'SCHD', subtitle: 'K 线卡 · 日线' },
  { id: 'qqq-roc', kind: 'roc', ticker: 'QQQ', title: 'QQQ · ROC (35)', subtitle: '指标卡' },
]

export interface LineDef {
  label: string
  color: string
  data: Point[]
}

// VTV/QQQ、SCHD/QQQ、CGDV/QQQ 的 ROC-35 同图(CGDV 2022-03 起有数据,日期对齐自动处理)
export const RATIO_ROC_LINES: LineDef[] = [
  { label: 'VTV/QQQ', color: COLORS.series[0], data: ratioRoc(BARS.VTV, BARS.QQQ) },
  { label: 'SCHD/QQQ', color: COLORS.series[1], data: ratioRoc(BARS.SCHD, BARS.QQQ) },
  { label: 'CGDV/QQQ', color: COLORS.series[2], data: ratioRoc(BARS.CGDV, BARS.QQQ) },
]

export const QQQ_RSI = rsi(BARS.QQQ)
export const QQQ_ROC = roc(BARS.QQQ)
