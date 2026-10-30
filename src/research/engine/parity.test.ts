import { afterAll, describe, expect, it } from 'vitest'
import type { Metrics, RuleSpec } from '../types'
import { dataset, rawParity } from './testData'
import { runWorld } from './world'

interface Case {
  name: string
  lag: 0 | 1 | 2
  cost: number
  permuted: boolean
  metrics: Record<string, Metrics & { switches: number }>
}

const fixture = rawParity as { permutation: { idx: number[] }; rules: RuleSpec[]; cases: Case[] }
const idx = Int32Array.from(fixture.permutation.idx)
const KEYS = ['cagr', 'maxDrawdown', 'sharpe', 'exposure'] as const

describe('与 Python 引擎逐规则对拍(export_console.py 生成的基准)', () => {
  const worst: Record<string, number> = { cagr: 0, maxDrawdown: 0, sharpe: 0, exposure: 0, switchesPerYear: 0 }
  for (const c of fixture.cases) {
    it(`${c.name}:延迟 ${c.lag},${Object.keys(c.metrics).length} 条规则`, () => {
      const rules = fixture.rules.filter((r) => r.id in c.metrics)
      const ours = runWorld(dataset, c.permuted ? idx : null, rules, c.lag, c.cost)
      for (const rule of rules) {
        const py = c.metrics[rule.id]
        const ts = ours[rule.id].metrics
        for (const key of KEYS) {
          worst[key] = Math.max(worst[key], Math.abs(ts[key] - py[key]))
          expect(Math.abs(ts[key] - py[key]), `${rule.id}.${key}`).toBeLessThanOrEqual(1e-9)
        }
        expect(ours[rule.id].switches, `${rule.id}.switches`).toBe(py.switches)
        worst.switchesPerYear = Math.max(worst.switchesPerYear, Math.abs(ts.switchesPerYear - py.switchesPerYear))
      }
    })
  }
  afterAll(() => {
    console.info(`parity max |Δ| ${JSON.stringify(worst)}`)
  })
})
