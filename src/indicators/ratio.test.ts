import { describe, expect, it } from 'vitest'
import { ratioRoc, ratioSeries } from './ratio'
import type { Bar } from '../data/types'

function mkBars(closes: number[], dates: string[]): Bar[] {
  return closes.map((c, i) => ({
    datetime: dates[i]!,
    open: c,
    high: c,
    low: c,
    close: c,
    volume: 100,
  }))
}

describe('ratioSeries(日期对齐的收盘比值)', () => {
  it('只保留两边都有的日期,按分子/分母相除', () => {
    const a = mkBars([10, 20, 30], ['d1', 'd2', 'd3'])
    const b = mkBars([4, 5], ['d2', 'd3']) // d1 缺失,应被丢弃
    const out = ratioSeries(a, b)
    expect(out).toEqual([
      { datetime: 'd2', value: 5 },
      { datetime: 'd3', value: 6 },
    ])
  })

  it('分子独有的节假日(分母停牌)同样丢弃', () => {
    const a = mkBars([10, 20], ['d1', 'd2'])
    const b = mkBars([10], ['d1'])
    expect(ratioSeries(a, b)).toEqual([{ datetime: 'd1', value: 1 }])
  })
})

describe('ratioRoc(比值序列的 N 日 ROC,本项目核心自定义指标)', () => {
  it('端到端:比值 → ROC', () => {
    const dates = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6']
    const a = mkBars([10, 12, 12, 12, 24, 24], dates)
    const b = mkBars([10, 10, 10, 10, 10, 10], dates)
    // ratio = [1, 1.2, 1.2, 1.2, 2.4, 2.4];roc(3) → d4: 1.2/1, d5: 2.4/1.2, d6: 2.4/1.2
    const out = ratioRoc(a, b, 3)
    const expected = [20, 100, 100]
    out.forEach((p, i) => expect(p.value).toBeCloseTo(expected[i]!, 9))
    expect(out.map((p) => p.datetime)).toEqual(['d4', 'd5', 'd6'])
  })
})
