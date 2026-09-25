import { useEffect, useRef, useState } from 'react'
import { LineSeries, LineStyle } from 'lightweight-charts'
import type { ISeriesApi, IPriceLine, MouseEventParams, Time } from 'lightweight-charts'
import type { Point } from '../indicators/series'
import { lineData, tsToDate } from './convert'
import type { RangeKey } from './convert'
import { applyRange } from './range'
import { CHART_COLORS } from './theme'
import { useChart } from './useChart'

interface Readout {
  date: string
  value: number
}

/**
 * 指标卡:单 Ticker 单指标的单线图。
 * 标题即图名(单序列不放图例框);refLines 画参考线(RSI 的 30/70)。
 */
export function IndicatorChart({
  title,
  points,
  range,
  unit = '',
  precision = 2,
  refLines = [],
}: {
  title: string
  points: Point[]
  range: RangeKey
  unit?: string
  precision?: number
  refLines?: number[]
}) {
  const { containerRef, chartRef } = useChart()
  const lineRef = useRef<ISeriesApi<'Line'> | null>(null)
  const priceLinesRef = useRef<IPriceLine[]>([])
  const [readout, setReadout] = useState<Readout | null>(null)

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const line = chart.addSeries(LineSeries, {
      color: CHART_COLORS.series[0]!,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: { type: 'price', precision, minMove: Math.pow(10, -precision) },
    })
    lineRef.current = line

    const onMove = (param: MouseEventParams<Time>) => {
      if (param.time == null) {
        setReadout(null)
        return
      }
      const d = param.seriesData.get(line) as { value?: number } | undefined
      if (d?.value != null) {
        setReadout({ date: tsToDate(param.time as number), value: d.value })
      }
    }
    chart.subscribeCrosshairMove(onMove)
    return () => {
      chart.unsubscribeCrosshairMove(onMove)
      lineRef.current = null
      priceLinesRef.current = []
    }
  }, [precision])

  // 参考线随配置变化
  useEffect(() => {
    const line = lineRef.current
    if (!line) return
    for (const pl of priceLinesRef.current) line.removePriceLine(pl)
    priceLinesRef.current = refLines.map((price) =>
      line.createPriceLine({
        price,
        color: 'rgba(120, 123, 134, 0.6)',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: '',
      }),
    )
  }, [refLines])

  // 数据与可见范围
  useEffect(() => {
    const chart = chartRef.current
    const line = lineRef.current
    if (!chart || !line || points.length === 0) return
    line.setData(lineData(points))
    applyRange(chart, points[points.length - 1]!.datetime, range)
  }, [points, range])

  const shown = readout ?? (points.length > 0 ? { date: points[points.length - 1]!.datetime, value: points[points.length - 1]!.value } : null)

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {shown && (
        <div className="pointer-events-none absolute left-2 top-1.5 z-10 flex items-center gap-3 rounded bg-surface/70 px-1 py-0.5 text-[11px] tabular-nums backdrop-blur-[2px]">
          <span className="font-semibold text-ink">{title}</span>
          <span className="text-ink-muted">{shown.date}</span>
          <span className="text-ink">
            {shown.value.toFixed(precision)}
            {unit}
          </span>
        </div>
      )}
    </div>
  )
}
