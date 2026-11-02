import type { Bar } from '../data/types'
import { addDays } from '../lib/date'
import type { PriceBar } from '../market/model'

export function weekdays(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay()
    if (dow !== 0 && dow !== 6) out.push(d)
  }
  return out
}

export function syntheticBars(seed: number, from = '2023-01-02', to = '2026-10-09'): Bar[] {
  return weekdays(from, to).map((datetime, i) => {
    const close = 100 + 12 * Math.sin(i / (11 + seed) + seed) + i * 0.015 * seed
    return { datetime, open: close, high: close * 1.01, low: close * 0.99, close, volume: 1000 }
  })
}

export function syntheticPriceBars(seed: number, from = '2024-10-01', to = '2026-10-09'): PriceBar[] {
  return syntheticBars(seed, from, to).map((b) => ({ date: b.datetime, close: b.close, high: b.high }))
}
