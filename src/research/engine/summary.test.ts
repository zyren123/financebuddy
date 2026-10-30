import { describe, expect, it } from 'vitest'
import type { Metrics } from '../types'
import { pairedWins, quantiles, summarize } from './summary'

const m = (cagr: number, maxDrawdown: number, sharpe = 0): Metrics => ({ cagr, maxDrawdown, sharpe, exposure: 1, switchesPerYear: 0 })

describe('分布汇总', () => {
  it('分位数与 numpy.quantile 默认线性插值逐位一致', () => {
    // numpy 2.5: np.quantile(a, [.05, .25, .5, .75, .95])
    expect(quantiles([0.31, -0.12, 0.05, 0.27, 0.18, -0.4, 0.09])).toEqual({ p05: -0.316, p25: -0.03499999999999999, p50: 0.09, p75: 0.225, p95: 0.298 })
    expect(quantiles([3, 1, 2, 10])).toEqual({ p05: 1.15, p25: 1.75, p50: 2.5, p75: 4.75, p95: 8.949999999999998 })
  })

  it('真实历史分位 = 比它差的世界占比;回撤深于 -70% 的占比', () => {
    const worlds = { a: [m(0.1, -0.9), m(0.2, -0.5), m(0.3, -0.75), m(0.4, -0.6)] }
    const [s] = summarize(worlds, { a: m(0.25, -0.7) })
    expect(s.worlds).toBe(4)
    expect(s.actualCagrPercentile).toBe(0.5)
    expect(s.actualDrawdownPercentile).toBe(0.5)
    expect(s.pDrawdownWorse70).toBe(0.5)
  })

  it('配对胜率按同一世界比较,回撤以更浅为胜,不含自身', () => {
    const paired = pairedWins({ a: [m(0.1, -0.5, 1), m(0.3, -0.9, 0)], b: [m(0.2, -0.6, 0.5), m(0.2, -0.8, 0.5)] })
    expect(paired.a.b).toEqual({ cagr: 0.5, maxDrawdown: 0.5, sharpe: 0.5 })
    expect(paired.b.a).toEqual({ cagr: 0.5, maxDrawdown: 0.5, sharpe: 0.5 })
    expect(paired.a.a).toBeUndefined()
    const lopsided = pairedWins({ a: [m(0.1, -0.5), m(0.3, -0.4)], b: [m(0.0, -0.6), m(0.2, -0.8)] })
    expect(lopsided.a.b.cagr).toBe(1)
    expect(lopsided.b.a.maxDrawdown).toBe(0)
  })
})
