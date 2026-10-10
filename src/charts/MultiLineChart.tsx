import { useEffect, useRef, useState } from 'react'
import { LineSeries, LineStyle } from 'lightweight-charts'
import type { ISeriesApi, MouseEventParams, Time } from 'lightweight-charts'
import type { Point } from '../indicators/series'
import { lineData, tsToDate } from './convert'
import type { RangeKey } from './convert'
import { applyRange } from './range'
import { CHART_COLORS } from './theme'
import { useChart } from './useChart'

export interface LineSeriesSpec {
  label: string
  points: Point[]
}

interface CrosshairState {
  date: string
  values: Array<number | undefined>
}

/**
 * 多序列折线卡(Ratio ROC 卡的渲染主体):
 * 分类色按槽位顺序固定分配;≥2 序列必有图例(色块 + 名称 + 十字线联动数值);
 * 值全为百分比,共用一条价格轴(永不双轴)。
 */
export function MultiLineChart({
  series,
  range,
  unit = '%',
}: {
  series: LineSeriesSpec[]
  range: RangeKey
  unit?: string
}) {
  const { containerRef, chartRef } = useChart()
  const seriesRefs = useRef<Array<ISeriesApi<'Line'>>>([])
  const [crosshair, setCrosshair] = useState<CrosshairState | null>(null)

  const signature = series.map((s) => s.label).join('|')

  // 建图与序列(序列集合变化时重建)
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    const created = series.map((_spec, i) =>
      chart.addSeries(LineSeries, {
        color: CHART_COLORS.series[i % CHART_COLORS.series.length]!,
        lineWidth: 2,
        crosshairMarkerBorderColor: CHART_COLORS.surface,
        priceLineVisible: false,
        lastValueVisible: false,
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      }),
    )
    // 0 轴参考线(ROC 的极性锚点,即封面探测器的顶点),放在首条序列上
    created[0]?.createPriceLine({
      price: 0,
      color: CHART_COLORS.copper,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: false,
      title: '',
    })
    seriesRefs.current = created

    const onMove = (param: MouseEventParams<Time>) => {
      if (param.time == null) {
        setCrosshair(null)
        return
      }
      setCrosshair({
        date: tsToDate(param.time as number),
        values: created.map((s) => {
          const d = param.seriesData.get(s) as { value?: number } | undefined
          return d?.value
        }),
      })
    }
    chart.subscribeCrosshairMove(onMove)
    return () => {
      chart.unsubscribeCrosshairMove(onMove)
      seriesRefs.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signature 即序列集合
  }, [signature])

  // 数据与可见范围
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || series.length === 0) return
    series.forEach((spec, i) => {
      seriesRefs.current[i]?.setData(lineData(spec.points))
    })
    const lastDate = series
      .flatMap((s) => s.points.slice(-1))
      .map((p) => p.datetime)
      .sort()
      .at(-1)
    if (lastDate) applyRange(chart, lastDate, range)
  }, [series, range])

  const lastValues = series.map((s) => s.points.at(-1)?.value)

  const lastDate = series
    .flatMap((s) => s.points.slice(-1))
    .map((p) => p.datetime)
    .sort()
    .at(-1)

  return (
    <div className="flex h-full w-full flex-col">
      {/* 图例:文本用 ink token,色线承载序列身份;十字线移动时读数跟随 */}
      <div className="num flex shrink-0 flex-wrap items-baseline gap-x-5 gap-y-1 px-1 pb-2 text-[11px]">
        {series.map((spec, i) => {
          const value = crosshair?.values[i] ?? lastValues[i]
          return (
            <span key={spec.label} className="flex items-baseline gap-2">
              <span
                aria-hidden
                className="inline-block h-[2px] w-4 self-center"
                style={{ backgroundColor: CHART_COLORS.series[i % CHART_COLORS.series.length] }}
              />
              <span className="text-ink-muted">{spec.label}</span>
              <span className="text-ink">{value != null ? `${value.toFixed(2)}${unit}` : '—'}</span>
            </span>
          )
        })}
        <span className="ml-auto text-ink-faint">{crosshair?.date ?? lastDate}</span>
      </div>
      <div ref={containerRef} className="chart-surface min-h-0 w-full flex-1" />
    </div>
  )
}
