import { useMemo } from 'react'
import { useBars, useBarsMany } from '../data/useBars'
import type { Bar } from '../data/types'
import { CandlestickChart } from '../charts/CandlestickChart'
import { IndicatorChart } from '../charts/IndicatorChart'
import { MultiLineChart } from '../charts/MultiLineChart'
import type { LineSeriesSpec } from '../charts/MultiLineChart'
import { closePoints } from '../indicators/series'
import type { Point } from '../indicators/series'
import { ema, sma } from '../indicators/overlap'
import { rsi, roc } from '../indicators/momentum'
import { ratioRoc } from '../indicators/ratio'
import type { CardConfig } from './types'

function uniq(values: string[]): string[] {
  return [...new Set(values)]
}

function Status({ loading, error }: { loading: boolean; error: Error | null }) {
  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-xs text-down">
        数据加载失败:{error.message}
      </div>
    )
  }
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-ink-muted">
        加载中…(免费配额 8 次/分钟,多标的会分批点亮)
      </div>
    )
  }
  return null
}

function computeIndicator(kind: string, period: number, bars: Bar[]): Point[] {
  const pts = closePoints(bars)
  switch (kind) {
    case 'rsi':
      return rsi(pts, period)
    case 'roc':
      return roc(pts, period)
    case 'sma':
      return sma(pts, period)
    case 'ema':
      return ema(pts, period)
  }
  return []
}

/** 按 CardConfig 取数、算指标、渲染对应图表 */
export function CardView({ card }: { card: CardConfig }) {
  if (card.kind === 'candle') return <CandleCardView card={card} />
  if (card.kind === 'ratioRoc') return <RatioRocCardView card={card} />
  return <IndicatorCardView card={card} />
}

function CandleCardView({ card }: { card: CardConfig & { kind: 'candle' } }) {
  const { data, isPending, error } = useBars(card.symbol)
  if (data && data.length > 0) {
    return <CandlestickChart symbol={card.symbol} bars={data} range={card.range} />
  }
  return <Status loading={isPending} error={error} />
}

function RatioRocCardView({ card }: { card: CardConfig & { kind: 'ratioRoc' } }) {
  const symbols = useMemo(
    () => uniq(card.pairs.flatMap((p) => [p.numerator, p.denominator])),
    [card.pairs],
  )
  const results = useBarsMany(symbols)
  const loading = results.some((r) => r.isPending)
  const error = results.find((r) => r.error)?.error ?? null

  const series: LineSeriesSpec[] = useMemo(() => {
    const bySymbol = new Map<string, Bar[]>()
    symbols.forEach((s, i) => {
      const bars = results[i].data
      if (bars) bySymbol.set(s, bars)
    })
    return card.pairs.map((p) => ({
      label: `${p.numerator}/${p.denominator}`,
      points: ratioRoc(bySymbol.get(p.numerator) ?? [], bySymbol.get(p.denominator) ?? [], card.rocPeriod),
    }))
  }, [symbols, results, card.pairs, card.rocPeriod])

  if (!loading && series.some((s) => s.points.length > 0)) {
    return <MultiLineChart series={series} range={card.range} />
  }
  return <Status loading={loading} error={error} />
}

function IndicatorCardView({ card }: { card: CardConfig & { kind: 'indicator' } }) {
  const { data, isPending, error } = useBars(card.symbol)
  const points = useMemo(
    () => (data ? computeIndicator(card.indicator, card.period, data) : []),
    [data, card.indicator, card.period],
  )

  if (points.length > 0) {
    const isRsi = card.indicator === 'rsi'
    return (
      <IndicatorChart
        title={`${card.symbol} ${card.indicator.toUpperCase()}(${card.period})`}
        points={points}
        range={card.range}
        unit={card.indicator === 'roc' ? '%' : ''}
        precision={isRsi ? 1 : 2}
        refLines={isRsi ? [30, 70] : []}
      />
    )
  }
  return <Status loading={isPending} error={error} />
}
