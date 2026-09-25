import { acquireCredit } from './rateLimit'
import type { Bar, Interval } from './types'

interface RawBar {
  datetime: string
  open?: string
  high?: string
  low?: string
  close?: string
  volume?: string | null
}

interface TimeSeriesResponse {
  meta?: { symbol?: string; interval?: string }
  values?: RawBar[]
  status?: string
  code?: number
  message?: string
}

export interface FetchBarsOpts {
  symbol: string
  interval: Interval
  /** 1–5000;超长历史需自行按日期分段(共识:5000 根 ≈ 20 年,视为全量) */
  outputsize?: number
  startDate?: string
  endDate?: string
}

function parseBar(b: RawBar): Bar {
  return {
    datetime: b.datetime,
    open: Number(b.open),
    high: Number(b.high),
    low: Number(b.low),
    close: Number(b.close),
    volume: b.volume == null ? null : Number(b.volume),
  }
}

/**
 * 经薄代理拉取 time_series(GET /api/td?endpoint=time_series&…,Vercel 与
 * EdgeOne 同一路由)。注意:API 返回**新→旧**排序,此处翻转为旧→新。
 * 每次调用消耗 1 credit(先过限速队列)。
 */
export async function fetchBars(opts: FetchBarsOpts): Promise<Bar[]> {
  const params = new URLSearchParams({
    endpoint: 'time_series',
    symbol: opts.symbol,
    interval: opts.interval,
    outputsize: String(opts.outputsize ?? 5000),
  })
  if (opts.startDate) params.set('start_date', opts.startDate)
  if (opts.endDate) params.set('end_date', opts.endDate)

  await acquireCredit()
  const res = await fetch(`/api/td?${params.toString()}`)
  if (!res.ok) {
    throw new Error(`代理请求失败:HTTP ${res.status}`)
  }
  const json = (await res.json()) as TimeSeriesResponse
  if (json.status === 'error' || json.code !== undefined) {
    throw new Error(`Twelve Data 错误(code ${json.code ?? '?'}):${json.message ?? '未知错误'}`)
  }
  return (json.values ?? []).map(parseBar).reverse()
}
