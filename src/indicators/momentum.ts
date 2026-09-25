import type { Point } from './series'

/** ROC(变动率,%):(v[t] / v[t-N] - 1) × 100,前 N 个暖机点不输出 */
export function roc(points: Point[], period: number): Point[] {
  const out: Point[] = []
  for (let i = period; i < points.length; i++) {
    const prev = points[i - period]!.value
    const cur = points[i]!.value
    out.push({
      datetime: points[i]!.datetime,
      value: prev === 0 ? Number.NaN : ((cur - prev) / prev) * 100,
    })
  }
  return out
}

/** RSI(Wilder 平滑)。首个输出在第 period 个点(需 period 个变化量) */
export function rsi(points: Point[], period = 14): Point[] {
  if (points.length <= period) return []
  const out: Point[] = []

  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const change = points[i]!.value - points[i - 1]!.value
    if (change >= 0) avgGain += change
    else avgLoss -= change
  }
  avgGain /= period
  avgLoss /= period
  out.push({ datetime: points[period]!.datetime, value: rsiFrom(avgGain, avgLoss) })

  for (let i = period + 1; i < points.length; i++) {
    const change = points[i]!.value - points[i - 1]!.value
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period
    out.push({ datetime: points[i]!.datetime, value: rsiFrom(avgGain, avgLoss) })
  }
  return out
}

function rsiFrom(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return 100
  return 100 - 100 / (1 + avgGain / avgLoss)
}
