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
import { describeDataError } from '../data/errors'

function uniq(values: string[]): string[] {
  return [...new Set(values)]
}

/** 缺数状态:一个空槽位加一张说明标签,而不是红字报错 */
function Status({ loading, error }: { loading: boolean; error: Error | null }) {
  if (!error && !loading) return null
  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="max-w-[34ch] border border-dashed border-copper-dim px-4 py-3 text-center text-[12px] leading-relaxed text-ink-muted">
        {error ? describeDataError(error) : '取数中…免费配额每分钟 8 次,多标的会分批点亮'}
      </div>
    </div>
  )
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
