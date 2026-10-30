import type { Bar } from './types.js'

export interface RawTimeSeriesBar {
  datetime: string
  open?: unknown
  high?: unknown
  low?: unknown
  close?: unknown
  volume?: unknown
}

function parseBar(b: RawTimeSeriesBar): Bar {
  return {
    datetime: b.datetime,
    open: Number(b.open),
    high: Number(b.high),
    low: Number(b.low),
    close: Number(b.close),
    volume: b.volume == null ? null : Number(b.volume),
  }
}

/** Twelve Data time_series 的 values(新→旧)→ 旧→新的 Bar[];浏览器与服务端同一口径 */
export function barsFromTimeSeries(values: RawTimeSeriesBar[]): Bar[] {
  return values.map(parseBar).reverse()
}
