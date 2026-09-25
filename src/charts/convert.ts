import type { Bar } from '../data/types'
import type { Point } from '../indicators/series'
import type { CandlestickData, HistogramData, LineData, UTCTimestamp } from 'lightweight-charts'
import { CHART_COLORS, withAlpha } from './theme'

/** 'YYYY-MM-DD' → UTC 秒(lightweight-charts 的 time) */
export function dateToTs(d: string): UTCTimestamp {
  return (Date.parse(`${d}T00:00:00Z`) / 1000) as UTCTimestamp
}

export function tsToDate(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10)
}

export function lineData(points: Point[]): LineData[] {
  return points
    .filter((p) => Number.isFinite(p.value))
    .map((p) => ({ time: dateToTs(p.datetime), value: p.value }))
}

export function candleData(bars: Bar[]): CandlestickData[] {
  return bars.map((b) => ({
    time: dateToTs(b.datetime),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  }))
}

export function volumeData(bars: Bar[]): HistogramData[] {
  return bars
    .filter((b) => b.volume != null)
    .map((b) => ({
      time: dateToTs(b.datetime),
      value: b.volume!,
      color: withAlpha(b.close >= b.open ? CHART_COLORS.up : CHART_COLORS.down, 0.45),
    }))
}

// ---- 时间范围快捷键(共识:默认 3 年)----

export type RangeKey = '6m' | '1y' | '3y' | '5y' | 'max'

export const RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
  { key: '6m', label: '6月' },
  { key: '1y', label: '1年' },
  { key: '3y', label: '3年' },
  { key: '5y', label: '5年' },
  { key: 'max', label: '全部' },
]

const RANGE_DAYS: Record<Exclude<RangeKey, 'max'>, number> = {
  '6m': 183,
  '1y': 366,
  '3y': 1096,
  '5y': 1827,
}

/** range 起点(UTC 秒);max 返回 null(由调用方 fitContent) */
export function rangeStartTs(key: RangeKey, lastTs: number): number | null {
  if (key === 'max') return null
  return lastTs - RANGE_DAYS[key] * 86_400
}
