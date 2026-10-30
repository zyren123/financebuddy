/**
 * 一个平行世界:按 idx 重排逐日收益,放回原日历,重建信号所需的收盘序列,再跑每条规则。
 * 口径同 bootstrap.py 的 run_world:收盘 = (1 + r).cumprod(),评估从第 251 + lag 行起,信号整体右移 lag 行。
 */
import { PATH_POINTS, type Dataset, type GateParams, type Metrics, type RuleSpec, type SignalBasis } from '../types'
import { metrics, portfolio, weightedPortfolio, yearsBetween, type Run } from './portfolio'
import { rollingMean } from './rolling'
import { gateIndicators, gateSignal, pctChange, smaBand, type GateIndicators } from './signals'

export interface RuleWorld {
  metrics: Metrics
  /** log10 净值,PATH_POINTS 个点 */
  path: Float32Array
  /** 评估区间第 1 行起的换仓次数;switchesPerYear 的分子 */
  switches: number
}

/** 第一个估值收盘的行号;dataset.evalStart 对应基准延迟 1 */
export function evalStartRow(dataset: Dataset, executionLag: number): number {
  return dataset.evalStart - 1 + executionLag
}

/** 评估区间内被降采样的行(相对评估起点),首尾都在内 */
export function pathRows(rows: number): Int32Array {
  const out = new Int32Array(PATH_POINTS)
  for (let k = 0; k < PATH_POINTS; k++) out[k] = Math.round((k * (rows - 1)) / (PATH_POINTS - 1))
  return out
}

/** 降采样点的日期;不依赖任何世界,界面在结果到达前就能画时间轴 */
export function pathDates(dataset: Dataset, executionLag: number): string[] {
  const start = evalStartRow(dataset, executionLag)
  return Array.from(pathRows(dataset.dates.length - start), (r) => dataset.dates[start + r])
}

function gather(source: Float64Array, idx: Int32Array | null): Float64Array {
  if (!idx) return source
  const out = new Float64Array(idx.length)
  for (let i = 0; i < idx.length; i++) out[i] = source[idx[i]]
  return out
}

function compound(returns: Float64Array): Float64Array {
  const out = new Float64Array(returns.length)
  let level = 1
  for (let i = 0; i < returns.length; i++) out[i] = level *= 1 + returns[i]
  return out
}

export function runWorld(dataset: Dataset, idx: Int32Array | null, rules: RuleSpec[], executionLag: number, costBps: number): Record<string, RuleWorld> {
  const n = dataset.dates.length
  const start = evalStartRow(dataset, executionLag)
  const signalRow = start - executionLag
  const years = yearsBetween(dataset.dates[start], dataset.dates[n - 1])
  const rows = pathRows(n - start)
  const returns = new Map<'tqqq' | SignalBasis | 'cash', Float64Array>()
  const series = (key: 'tqqq' | SignalBasis | 'cash') => {
    let s = returns.get(key)
    if (!s) returns.set(key, (s = gather(dataset[key], idx)))
    return s
  }
  const closes = new Map<SignalBasis, Float64Array>()
  const close = (basis: SignalBasis) => {
    let c = closes.get(basis)
    if (!c) closes.set(basis, (c = compound(series(basis))))
    return c
  }
  const risk = series('tqqq').subarray(start)
  const cash = series('cash').subarray(start)
  const stdCache = new Map<number, Float64Array>()
  const gates = new Map<string, GateIndicators>()
  const averages = new Map<string, Float64Array>()

  const gateTarget = (p: GateParams) => {
    const key = `${p.shortWindow}/${p.longWindow}`
    let ind = gates.get(key)
    if (!ind) {
      const ndx = close('ndx')
      gates.set(key, (ind = gateIndicators(ndx, pctChange(ndx), p.shortWindow, p.longWindow, stdCache)))
    }
    if (!ind.valid[signalRow]) throw new Error(`三门 ${key} 在评估起点前未完成预热`)
    return gateSignal(ind, p)
  }
  const smaTarget = (basis: SignalBasis, window: number, enter: number, exit: number) => {
    const key = `${basis}/${window}`
    let average = averages.get(key)
    if (!average) averages.set(key, (average = rollingMean(close(basis), window)))
    if (!(average[signalRow] === average[signalRow])) throw new Error(`SMA${window} 在评估起点前未完成预热`)
    return smaBand(close(basis), window, enter, exit, average)
  }
  const lagged = (signal: Uint8Array) => signal.subarray(start - executionLag, n - executionLag)

  const out: Record<string, RuleWorld> = {}
  for (const rule of rules) {
    let run: Run
    switch (rule.kind) {
      case 'gate':
        run = portfolio(risk, cash, lagged(gateTarget(rule.params)), costBps)
        break
      case 'sma':
        run = portfolio(risk, cash, lagged(smaTarget(rule.basis, rule.window, rule.enter, rule.exit)), costBps)
        break
      case 'fixed':
        run = weightedPortfolio(risk, cash, new Float64Array(n - start).fill(rule.weight), rule.band, costBps)
        break
      case 'hold':
        run = portfolio(series(rule.asset).subarray(start), cash, new Uint8Array(n - start).fill(1), costBps)
        break
    }
    const m = metrics(run, cash, years)
    // 持有 QQQ 的 "仓位" 是 1× 基础,不是 TQQQ 权重
    if (rule.kind === 'hold' && rule.asset === 'qqq') m.exposure = 0
    const path = new Float32Array(rows.length)
    for (let k = 0; k < rows.length; k++) path[k] = Math.log10(run.equity[rows[k]])
    out[rule.id] = { metrics: m, path, switches: run.switches }
  }
  return out
}
