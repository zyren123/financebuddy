import { useMemo } from 'react'
import type { Bar } from './types'
import { useBarsMany } from './useBars'
import { ratioRoc } from '../indicators/ratio'
import type { RatioPair } from '../dashboard/types'

export interface RatioReading {
  label: string
  /** 最新收盘日的 Ratio ROC(%) */
  value: number
  /** N 个交易日前的读数,画成幽灵径迹;序列不够长时为 null */
  previous: number | null
  date: string
}

export interface RatioReadings {
  readings: RatioReading[]
  /** 已到手的标的数 / 需要的标的数(限速队列分批点亮,如实展示进度) */
  loaded: number
  total: number
  error: Error | null
  /** 所有 Ratio 中最新的收盘日 */
  date: string | null
}

/** 封面与页头共用的读数源;同 symbol 的 K 线由 react-query 与卡片去重 */
export function useRatioReadings(pairs: RatioPair[], period: number): RatioReadings {
  const symbols = useMemo(
    () => [...new Set(pairs.flatMap((p) => [p.numerator, p.denominator]))],
    [pairs],
  )
  const results = useBarsMany(symbols)
  const loaded = results.filter((r) => r.data).length
  const error = results.find((r) => r.error)?.error ?? null
  const dataKey = results.map((r) => r.dataUpdatedAt).join('|')

  const readings = useMemo(() => {
    if (loaded < symbols.length) return []
    const bySymbol = new Map<string, Bar[]>()
    symbols.forEach((s, i) => bySymbol.set(s, results[i]?.data ?? []))
    return pairs.flatMap((p): RatioReading[] => {
      const pts = ratioRoc(bySymbol.get(p.numerator) ?? [], bySymbol.get(p.denominator) ?? [], period)
      const last = pts.at(-1)
      if (!last || !Number.isFinite(last.value)) return []
      const prev = pts.at(-1 - period)
      return [
        {
          label: `${p.numerator}/${p.denominator}`,
          value: last.value,
          previous: prev && Number.isFinite(prev.value) ? prev.value : null,
          date: last.datetime,
        },
      ]
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dataKey 即 results 的数据版本
  }, [dataKey, loaded, symbols, pairs, period])

  const date = readings.map((r) => r.date).sort().at(-1) ?? null
  return { readings, loaded, total: symbols.length, error, date }
}

export type Verdict = 'growth' | 'value' | 'mixed'

/** 由读数机械生成的一句话结论,不含人工观点 */
export function verdictOf(readings: RatioReading[]): Verdict | null {
  if (readings.length === 0) return null
  if (readings.every((r) => r.value < 0)) return 'growth'
  if (readings.every((r) => r.value > 0)) return 'value'
  return 'mixed'
}
