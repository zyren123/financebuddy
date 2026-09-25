import type { Bar } from '../data/types'
import { roc } from './momentum'
import { alignByDate } from './series'
import type { Point } from './series'

/**
 * Ratio 的比值序列:分子/分母按日期对齐后的收盘价比。
 * 见 CONTEXT.md「Ratio」。
 */
export function ratioSeries(numerator: Bar[], denominator: Bar[]): Point[] {
  return alignByDate(numerator, denominator).map(([a, b]) => ({
    datetime: a.datetime,
    value: a.close / b.close,
  }))
}

/** Ratio ROC:比值序列的 N 日 ROC(默认 35),本项目第一个自定义指标 */
export function ratioRoc(numerator: Bar[], denominator: Bar[], rocPeriod: number): Point[] {
  return roc(ratioSeries(numerator, denominator), rocPeriod)
}
