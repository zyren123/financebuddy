/**
 * 收盘成交的组合与指标,逐行移植 backtest.py 的 portfolio()/metrics() 与 weights.py 的 weighted_portfolio()。
 * 所有数组都是评估区间内的行:第 0 行只是估值收盘,不赚收益,但照样扣初始建仓成本。
 */
import type { Metrics } from '../types'

export interface Run {
  /** 每行净收益;第 0 行 = 初始成本 */
  net: Float64Array
  equity: Float64Array
  /** 当日赚收益时的 TQQQ 权重 */
  earning: Float64Array
  /** 换仓次数(第 1 行起,与 metrics 口径一致) */
  switches: number
}

/** target[t] 是在 t 收盘、赚完旧仓收益后买入的 0/1 仓位 */
export function portfolio(risk: Float64Array, safe: Float64Array, target: Uint8Array, costBps: number): Run {
  const n = target.length
  const net = new Float64Array(n)
  const equity = new Float64Array(n)
  const earning = new Float64Array(n)
  const cost = costBps / 10000
  let switches = 0
  let value = 1
  for (let t = 0; t < n; t++) {
    const held = t === 0 ? 0 : target[t - 1]
    const switched = t === 0 || target[t] !== target[t - 1]
    if (switched && t > 0) switches++
    earning[t] = held
    const gross = t === 0 ? 0 : held === 1 ? risk[t] : safe[t]
    net[t] = (1 + gross) * (1 - (switched ? cost : 0)) - 1
    value *= 1 + net[t]
    equity[t] = value
  }
  return { net, equity, earning, switches }
}

/** 分数仓位每日随相对收益漂移;漂出 band 或在零与非零之间切换时调回目标,按 |成交权重| 收费 */
export function weightedPortfolio(risk: Float64Array, safe: Float64Array, target: Float64Array, band: number, costBps: number): Run {
  const n = target.length
  const net = new Float64Array(n)
  const equity = new Float64Array(n)
  const earning = new Float64Array(n)
  let switches = 0
  let weight = target[0]
  // 初始 $1 建仓按成交一个完整单位收费,0/1 目标时与 portfolio() 逐日相同
  net[0] = 1 - costBps / 10000 - 1
  let value = 1 + net[0]
  equity[0] = value
  for (let t = 1; t < n; t++) {
    earning[t] = weight
    const gross = weight * risk[t] + (1 - weight) * safe[t]
    weight = (weight * (1 + risk[t])) / (1 + gross)
    let turnover = 0
    if (weight > 0 !== target[t] > 0 || Math.abs(weight - target[t]) > band) {
      turnover = Math.abs(target[t] - weight)
      weight = target[t]
    }
    if (turnover > 0) switches++
    net[t] = (1 + gross) * (1 - (turnover * costBps) / 10000) - 1
    value *= 1 + net[t]
    equity[t] = value
  }
  return { net, equity, earning, switches }
}

/** years:评估区间首末日的自然日 / 365.25;cash 与 run 同行对齐 */
export function metrics(run: Run, cash: Float64Array, years: number): Metrics {
  const n = run.net.length
  let peak = 1
  let maxDrawdown = 0
  for (let t = 0; t < n; t++) {
    if (run.equity[t] > peak) peak = run.equity[t]
    const dd = run.equity[t] / peak - 1
    if (dd < maxDrawdown) maxDrawdown = dd
  }
  let sum = 0
  let exposure = 0
  for (let t = 1; t < n; t++) {
    sum += run.net[t] - cash[t]
    exposure += run.earning[t]
  }
  const m = n - 1
  const mean = sum / m
  let squares = 0
  for (let t = 1; t < n; t++) {
    const d = run.net[t] - cash[t] - mean
    squares += d * d
  }
  const std = Math.sqrt(squares / (m - 1))
  return {
    cagr: run.equity[n - 1] ** (1 / years) - 1,
    maxDrawdown,
    sharpe: std > 0 ? (mean / std) * Math.sqrt(252) : NaN,
    exposure: exposure / m,
    switchesPerYear: run.switches / years,
  }
}

export function yearsBetween(first: string, last: string): number {
  return (Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86_400_000 / 365.25
}
