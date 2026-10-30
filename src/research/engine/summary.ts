/** 平行世界分布的汇总,口径同 bootstrap_params.py 的 summarize() 与 export_console.py 的 run_json() */
import type { Metrics, PairedWins, Quantiles, RuleSummary } from '../types'

/** numpy.quantile 默认 method='linear',含其在 g ≥ 0.5 时从上端插值的写法 */
export function quantile(sorted: ArrayLike<number>, q: number): number {
  const n = sorted.length
  const virtual = q * (n - 1)
  const lo = Math.floor(virtual)
  const hi = Math.min(lo + 1, n - 1)
  const g = virtual - lo
  const a = sorted[lo]
  const b = sorted[hi]
  const diff = b - a
  return g >= 0.5 ? b - diff * (1 - g) : a + diff * g
}

export function quantiles(values: number[]): Quantiles {
  const sorted = Float64Array.from(values).sort()
  return {
    p05: quantile(sorted, 0.05),
    p25: quantile(sorted, 0.25),
    p50: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p95: quantile(sorted, 0.95),
  }
}

const share = (values: number[], test: (v: number, i: number) => boolean) => values.filter(test).length / values.length

export function summarize(metrics: Record<string, Metrics[]>, actual: Record<string, Metrics>): RuleSummary[] {
  return Object.entries(metrics).map(([ruleId, worlds]) => {
    const cagr = worlds.map((m) => m.cagr)
    const drawdown = worlds.map((m) => m.maxDrawdown)
    return {
      ruleId,
      worlds: worlds.length,
      cagr: quantiles(cagr),
      maxDrawdown: quantiles(drawdown),
      sharpe: quantiles(worlds.map((m) => m.sharpe)),
      pDrawdownWorse70: share(drawdown, (d) => d < -0.7),
      actualDrawdownPercentile: share(drawdown, (d) => d < actual[ruleId].maxDrawdown),
      actualCagrPercentile: share(cagr, (c) => c < actual[ruleId].cagr),
    }
  })
}

export function pairedWins(metrics: Record<string, Metrics[]>): PairedWins {
  const out: PairedWins = {}
  for (const [a, left] of Object.entries(metrics)) {
    out[a] = {}
    for (const [b, right] of Object.entries(metrics)) {
      if (a === b) continue
      out[a][b] = {
        cagr: share(left.map((m) => m.cagr), (v, i) => v > right[i].cagr),
        maxDrawdown: share(left.map((m) => m.maxDrawdown), (v, i) => v > right[i].maxDrawdown),
        sharpe: share(left.map((m) => m.sharpe), (v, i) => v > right[i].sharpe),
      }
    }
  }
  return out
}
