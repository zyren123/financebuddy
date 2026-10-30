import type { RatioPair } from '../dashboard/types.js'
import type { IndexId } from '../market/model.js'

/** 浏览器 fetch 与 index.html 的 preload 必须是同一个固定 URL(无参数),preload 才能被复用 */
export const READINGS_URL = '/api/readings'

/** 封闭集合;中文文案只在客户端决定 */
export type UnavailableReason = 'source-down' | 'insufficient'

/** 每一项各自带日期与状态:某个来源挂了只影响这一项 */
export type Item =
  | { status: 'ready'; value: number; date: string }
  | { status: 'unavailable'; reason: UnavailableReason }

/** pair 内嵌在项里,口径从 ratios 派生,不另存一份 */
export interface RatioItem {
  pair: RatioPair
  /** 最新收盘日的 Ratio ROC(%) */
  roc: Item
  /** N 个交易日前的读数(幽灵径迹);历史不够时为 null */
  previous: number | null
}

export interface IndexReadings {
  rsi: Item
  drawdown: Item
  pe: Item
  percentile: Item
}

export interface MarketReadings {
  indices: Record<IndexId, IndexReadings>
  vix: Item
  fearGreed: Item
}

/** GET /api/readings:服务端按 Published Layout(未发布则 Factory 口径)算好的快照 */
export interface ReadingsSnapshot {
  computedAt: number
  rocPeriod: number
  /** 按布局顺序;顺序决定封面/页头的配色序号 */
  ratios: RatioItem[]
  market: MarketReadings
  /**
   * 布局里每个 symbol 在服务端的最新 K 线日期:开页预取这些 symbol;
   * IndexedDB 比它旧就主动刷新。拉不到的 symbol 不出现。
   */
  bars: Record<string, string>
}

/** Ratio 读数的口径:哪几对 + 周期 */
export interface ReadingsBasis {
  pairs: RatioPair[]
  rocPeriod: number
}
