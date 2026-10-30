import { describe, expect, it } from 'vitest'
import { DEFAULT_GATE, PATH_POINTS, type ExperimentConfig, type RuleSpec } from '../types'
import { runExperimentSync } from './runExperiment'
import { dataset } from './testData'
import { evalStartRow, pathDates, runWorld } from './world'

const RULES: RuleSpec[] = [
  { kind: 'gate', id: 'three_gate_default', params: DEFAULT_GATE },
  { kind: 'gate', id: 'three_gate_confirmation_days=1', params: { ...DEFAULT_GATE, confirmationDays: 1 } },
  { kind: 'sma', id: 'sma200_+4/-3_qqq', basis: 'qqq', window: 200, enter: 0.04, exit: 0.03 },
  { kind: 'sma', id: 'sma200_+4/-3_spy', basis: 'spy', window: 200, enter: 0.04, exit: 0.03 },
  { kind: 'hold', id: 'tqqq_hold', asset: 'tqqq' },
  { kind: 'hold', id: 'qqq_hold', asset: 'qqq' },
]

describe('平行世界', () => {
  it('评估起点 = 251 + 延迟;路径首尾为评估区间首末日的 log10 净值', () => {
    expect(evalStartRow(dataset, 1)).toBe(252)
    expect(evalStartRow(dataset, 0)).toBe(251)
    const dates = pathDates(dataset, 1)
    expect(dates).toHaveLength(PATH_POINTS)
    expect(dates[0]).toBe('1986-10-01')
    expect(dates[PATH_POINTS - 1]).toBe(dataset.dates[dataset.dates.length - 1])
    const world = runWorld(dataset, null, RULES, 1, 2.5)
    const hold = world.tqqq_hold
    // 首日只扣初始成本
    expect(hold.path[0]).toBeCloseTo(Math.log10(1 - 2.5 / 10000), 7)
    const years = (Date.parse(dates[PATH_POINTS - 1]) - Date.parse(dates[0])) / 86_400_000 / 365.25
    expect(10 ** hold.path[PATH_POINTS - 1]).toBeCloseTo((1 + hold.metrics.cagr) ** years, 0)
    expect(world.qqq_hold.metrics.exposure).toBe(0)
  })

  it('恒等重排与真实顺序逐位相同;倒序世界改变择时结果', () => {
    const n = dataset.dates.length
    const actual = runWorld(dataset, null, RULES, 1, 2.5)
    const identity = runWorld(dataset, Int32Array.from({ length: n }, (_, i) => i), RULES, 1, 2.5)
    expect(identity).toEqual(actual)
    const reversed = runWorld(dataset, Int32Array.from({ length: n }, (_, i) => n - 1 - i), RULES, 1, 2.5)
    expect(reversed.three_gate_default.metrics.cagr).not.toBe(actual.three_gate_default.metrics.cagr)
  })

  it('预热不足时报错而不是静默给出结果', () => {
    const tooLong: RuleSpec = { kind: 'sma', id: 'x', basis: 'ndx', window: 400, enter: 0, exit: 0 }
    expect(() => runWorld(dataset, null, [tooLong], 1, 2.5)).toThrow(/预热/)
  })

  it('性能:50 个世界 × 默认 6 条规则(同步)', () => {
    const config: ExperimentConfig = { method: 'stationary', block: 63, worlds: 50, seed: 1, rules: RULES, executionLag: 1, costBps: 2.5 }
    runExperimentSync(dataset, { ...config, worlds: 4 })
    const result = runExperimentSync(dataset, config)
    console.info(`sync ${config.worlds} worlds × ${RULES.length} rules: ${(result.elapsedMs / config.worlds).toFixed(2)} ms/world`)
    expect(result.summary.map((s) => s.ruleId)).toEqual(RULES.map((r) => r.id))
    expect(result.metrics.three_gate_default.every((m) => Number.isFinite(m.sharpe))).toBe(true)
  })
})
