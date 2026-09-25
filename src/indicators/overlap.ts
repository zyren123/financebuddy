import type { Point } from './series'

/** SMA:输出从第 period 个点开始(下标 period-1) */
export function sma(points: Point[], period: number): Point[] {
  const out: Point[] = []
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    sum += points[i]!.value
    if (i >= period) sum -= points[i - period]!.value
    if (i >= period - 1) {
      out.push({ datetime: points[i]!.datetime, value: sum / period })
    }
  }
  return out
}

/** EMA:以首个 period 窗口的 SMA 为种子,k = 2/(period+1) */
export function ema(points: Point[], period: number): Point[] {
  if (points.length < period) return []
  const k = 2 / (period + 1)
  const out: Point[] = []

  let seed = 0
  for (let i = 0; i < period; i++) seed += points[i]!.value
  let prev = seed / period
  out.push({ datetime: points[period - 1]!.datetime, value: prev })

  for (let i = period; i < points.length; i++) {
    prev += k * (points[i]!.value - prev)
    out.push({ datetime: points[i]!.datetime, value: prev })
  }
  return out
}
