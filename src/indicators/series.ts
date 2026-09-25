import type { Bar } from '../data/types'

/** 带日期的单值序列,一切指标(含 Ratio ROC)的统一输出格式 */
export interface Point {
  datetime: string
  value: number
}

export function closePoints(bars: Bar[]): Point[] {
  return bars.map((b) => ({ datetime: b.datetime, value: b.close }))
}

/** 按日期对齐两组 Bar(升序),只保留两边都有的交易日——假期/停牌差异自然丢弃 */
export function alignByDate(a: Bar[], b: Bar[]): Array<[Bar, Bar]> {
  const byDate = new Map(b.map((bar) => [bar.datetime, bar]))
  const pairs: Array<[Bar, Bar]> = []
  for (const barA of a) {
    const barB = byDate.get(barA.datetime)
    if (barB) pairs.push([barA, barB])
  }
  return pairs
}

/** 测试与工具用:纯数值转 Point(datetime 为 d0, d1, …) */
export function numbersToPoints(values: number[]): Point[] {
  return values.map((value, i) => ({ datetime: `d${i}`, value }))
}
