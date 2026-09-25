import type { RangeKey } from '../charts/convert'
import type { Layout } from 'react-grid-layout'

export type IndicatorKind = 'rsi' | 'roc' | 'sma' | 'ema'

interface BaseCard {
  id: string
  range: RangeKey
}

/** K 线卡:单 Ticker 蜡烛 + 成交量 */
export interface CandleCardConfig extends BaseCard {
  kind: 'candle'
  symbol: string
}

export interface RatioPair {
  numerator: string
  denominator: string
}

/** Ratio ROC 卡:多条 Ratio 的同周期 ROC 共轴 */
export interface RatioRocCardConfig extends BaseCard {
  kind: 'ratioRoc'
  pairs: RatioPair[]
  rocPeriod: number
}

/** 指标卡:单 Ticker 单指标 */
export interface IndicatorCardConfig extends BaseCard {
  kind: 'indicator'
  symbol: string
  indicator: IndicatorKind
  period: number
}

export type CardConfig = CandleCardConfig | RatioRocCardConfig | IndicatorCardConfig

export interface DashboardState {
  version: 1
  cards: CardConfig[]
  layout: Layout
}

export function cardTitle(card: CardConfig): string {
  switch (card.kind) {
    case 'candle':
      return `${card.symbol} 日K`
    case 'ratioRoc':
      return `Ratio ROC(${card.rocPeriod})`
    case 'indicator':
      return `${card.symbol} ${card.indicator.toUpperCase()}(${card.period})`
  }
}

export function newCardId(): string {
  return crypto.randomUUID()
}
