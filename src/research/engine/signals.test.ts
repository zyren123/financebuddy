import { describe, expect, it } from 'vitest'
import { DEFAULT_GATE, type GateParams } from '../types'
import { rollingMax, rollingMean, rollingStd } from './rolling'
import { gateIndicators, pctChange, smaBand, threeGate } from './signals'
import { dataset } from './testData'

const close = (returns: Float64Array) => {
  const out = new Float64Array(returns.length)
  let level = 1
  returns.forEach((r, i) => (out[i] = level *= 1 + r))
  return out
}

const ndx = close(dataset.ndx)

function naiveStd(values: Float64Array, end: number, window: number): number {
  let mean = 0
  for (let i = end - window + 1; i <= end; i++) mean += values[i]
  mean /= window
  let ss = 0
  for (let i = end - window + 1; i <= end; i++) ss += (values[i] - mean) ** 2
  return Math.sqrt(ss / (window - 1))
}

describe('滚动统计', () => {
  // 只对收益序列(三门唯一的输入)要求 1e-12;均值远大于波动的序列上,pandas 同款增删式 Welford 本身约 6e-11
  it('滚动样本标准差在真实收益上与朴素两遍法相对误差 ≤ 1e-12,预热期为 NaN', () => {
    for (const values of [dataset.ndx, dataset.qqq, dataset.spy]) {
      for (const window of [20, 250]) {
        const std = rollingStd(values, window)
        for (let i = 0; i < window - 1; i++) expect(std[i]).toBeNaN()
        let worst = 0
        for (let i = window - 1; i < values.length; i++) worst = Math.max(worst, Math.abs(std[i] / naiveStd(values, i, window) - 1))
        expect(worst).toBeLessThanOrEqual(1e-12)
      }
    }
  })

  it('NaN 不计观测数:首个收益缺失时,第 window 个有效值才出结果', () => {
    const returns = Float64Array.from([NaN, 0.01, -0.02, 0.03, 0.01])
    const std = rollingStd(returns, 3)
    expect([...std.subarray(0, 3)].every(Number.isNaN)).toBe(true)
    expect(std[3]).toBeCloseTo(naiveStd(returns, 3, 3), 15)
  })

  it('滚动均值与最大值含当日', () => {
    const values = Float64Array.from([1, 5, 2, 4, 3, 0.5])
    expect([...rollingMax(values, 3)]).toEqual([NaN, NaN, 5, 5, 4, 4])
    expect([...rollingMean(values, 2)].slice(1)).toEqual([3, 3.5, 3, 3.5, 1.75])
  })
})

describe('信号', () => {
  it('SMA 滞回带:高于上轨买入,带内保持,跌破下轨卖出', () => {
    const prices = Float64Array.from([100, 100, 110, 111, 108, 102, 103])
    // window 3 均线:-, -, 103.33(110 > 107.47 买入), 107(带内), 109.67(带内), 107(102 < 103.79 卖出), 104.33(带内)
    expect([...smaBand(prices, 3, 0.04, 0.03)]).toEqual([0, 0, 1, 1, 1, 0, 0])
  })

  const fast: GateParams = { ...DEFAULT_GATE, shortWindow: 10, longWindow: 150, confirmationDays: 1 }
  const firstDiff = (a: ArrayLike<number>, b: ArrayLike<number>, upto: number) => {
    for (let i = 0; i <= upto; i++) if (!Object.is(a[i], b[i])) return i
    return -1
  }
  const outputs = (c: Float64Array) => {
    const out: Record<string, ArrayLike<number>> = {
      gate: threeGate(c, DEFAULT_GATE),
      gateFast: threeGate(c, fast),
      sma: smaBand(c, 200, 0.04, 0.03),
      sma0: smaBand(c, 50, 0, 0),
      mean: rollingMean(c, 200),
    }
    for (const [short, long] of [[20, 250], [10, 150]]) {
      const ind = gateIndicators(c, pctChange(c), short, long)
      Object.assign(out, { [`vol${short}`]: ind.shortVol, [`shock${short}`]: ind.shock, [`dd${long}`]: ind.drawdown })
    }
    return out
  }

  it('无前视:改写第 t 行之后的收益(+300% 跳空或 -90% 崩盘),t 及以前的指标与信号都不变', () => {
    const base = outputs(ndx)
    const changedAfter = new Set<string>()
    for (let t = 300; t < ndx.length - 2; t += 37) {
      for (const jump of [3, -0.9]) {
        const shocked = outputs(close(Float64Array.from(dataset.ndx, (r, i) => (i === t + 1 ? jump : i > t ? -0.6 * r + 0.004 : r))))
        for (const key of Object.keys(base)) {
          expect(firstDiff(shocked[key], base[key], t), `${key} t=${t} jump=${jump}`).toBe(-1)
          if (firstDiff(shocked[key], base[key], ndx.length - 1) !== -1) changedAfter.add(key)
        }
      }
    }
    expect([...changedAfter].sort(), '扰动必须真的改变了之后的输出').toEqual(Object.keys(base).sort())
  })
})
