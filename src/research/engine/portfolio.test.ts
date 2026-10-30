import { describe, expect, it } from 'vitest'
import { metrics, portfolio, weightedPortfolio, yearsBetween } from './portfolio'

const risk = Float64Array.from([0, 0.1, -0.05, 0.2, 0.03, -0.1])
const safe = Float64Array.from([0, 0.001, 0.001, 0.001, 0.001, 0.001])

describe('组合', () => {
  it('t 收盘买入的仓位从 t+1 起赚收益;每次切换扣费,含初始建仓', () => {
    const run = portfolio(risk, safe, Uint8Array.from([0, 1, 1, 0, 0, 1]), 10)
    expect([...run.earning]).toEqual([0, 0, 1, 1, 0, 0])
    expect(run.net[0]).toBeCloseTo(-0.001, 15)
    expect(run.net[1]).toBeCloseTo(1.001 * 0.999 - 1, 15)
    expect(run.net[2]).toBeCloseTo(-0.05, 15)
    expect(run.switches).toBe(3)
  })

  it('分数仓位取 0/1 目标时与 0/1 组合逐日相同', () => {
    const target = Uint8Array.from([1, 1, 0, 0, 1, 1])
    const a = portfolio(risk, safe, target, 2.5)
    const b = weightedPortfolio(risk, safe, Float64Array.from(target), 0.1, 2.5)
    expect([...b.net]).toEqual([...a.net])
    expect(b.switches).toBe(a.switches)
  })

  it('固定权重随收益漂移,漂出再平衡带才交易', () => {
    const run = weightedPortfolio(Float64Array.from([0, 0.5, 0.5, 0]), Float64Array.from([0, 0, 0, 0]), new Float64Array(4).fill(0.5), 0.1, 0)
    // 0.5 → 0.6(带内) → 0.692(出带,调回 0.5)
    expect(run.earning[2]).toBeCloseTo(0.6, 15)
    expect(run.earning[3]).toBe(0.5)
    expect(run.switches).toBe(1)
  })

  it('回撤峰值含初始 $1;CAGR 按自然日 / 365.25', () => {
    const run = portfolio(Float64Array.from([0, -0.5, 1]), Float64Array.from([0, 0, 0]), Uint8Array.from([1, 1, 1]), 0)
    const years = yearsBetween('2000-01-01', '2002-01-01')
    expect(years).toBeCloseTo(731 / 365.25, 15)
    const m = metrics(run, Float64Array.from([0, 0, 0]), years)
    expect(m.maxDrawdown).toBeCloseTo(-0.5, 15)
    expect(m.cagr).toBeCloseTo(0, 15)
    expect(m.exposure).toBe(1)
  })
})
