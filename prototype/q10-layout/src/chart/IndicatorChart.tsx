// 指标卡:单 Ticker 单指标(QQQ RSI-14 / QQQ ROC-35)
import { useEffect, useRef } from 'react'
import {
  LineSeries,
  LineStyle,
  createChart,
  createTextWatermark,
  type IChartApi,
  type LineData,
  type Time,
} from 'lightweight-charts'
import { QQQ_RSI, QQQ_ROC } from '../cards'
import { COLORS } from '../theme'
import { applyRange, baseOptions, type RangeKey } from './chartBase'

const pctFmt = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`

export default function IndicatorChart({ kind, range }: { kind: 'rsi' | 'roc'; range: RangeKey }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const legendRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useEffect(() => {
    const data = kind === 'rsi' ? QQQ_RSI : QQQ_ROC
    const chart = createChart(hostRef.current!, baseOptions)
    chartRef.current = chart

    const line = chart.addSeries(LineSeries, {
      color: kind === 'rsi' ? COLORS.rsi : COLORS.roc,
      lineWidth: 2,
      priceLineVisible: false,
      priceFormat:
        kind === 'rsi'
          ? { type: 'custom', formatter: (v: number) => v.toFixed(0), minMove: 1 }
          : { type: 'custom', formatter: pctFmt, minMove: 0.1 },
    })
    line.setData(data.map((p) => ({ time: p.time as Time, value: p.value })))

    const mkLine = (price: number, style: LineStyle, opacity = 0.7) =>
      line.createPriceLine({
        price,
        color: `rgba(120,123,134,${opacity})`,
        lineWidth: 1,
        lineStyle: style,
        axisLabelVisible: false,
        title: '',
      })
    if (kind === 'rsi') {
      // RSI 固定 0-100 标尺 + 70/50/30 参考线
      line.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) })
      mkLine(70, LineStyle.Dashed)
      mkLine(50, LineStyle.Dotted, 0.45)
      mkLine(30, LineStyle.Dashed)
    } else {
      mkLine(0, LineStyle.Dashed)
    }

    createTextWatermark(chart.panes()[0], {
      horzAlign: 'center',
      vertAlign: 'center',
      lines: [
        {
          text: kind === 'rsi' ? 'QQQ · RSI 14 · MOCK' : 'QQQ · ROC 35 · MOCK',
          color: 'rgba(120,123,134,0.2)',
          fontSize: 40,
        },
      ],
    })

    const last = data[data.length - 1]?.value
    const fmt = kind === 'rsi' ? (v: number) => v.toFixed(1) : pctFmt
    const render = (v: number | undefined) => {
      const el = legendRef.current
      if (!el) return
      el.innerHTML = `<b>QQQ</b> <span>${kind === 'rsi' ? 'RSI (14)' : 'ROC (35)'}</span> <span class="num" style="color:${kind === 'rsi' ? COLORS.rsi : COLORS.roc}">${fmt(v ?? last)}</span>`
    }
    render(undefined)
    chart.subscribeCrosshairMove((p) => {
      const d = p.time ? (p.seriesData.get(line) as LineData | undefined) : undefined
      render(d?.value)
    })

    return () => {
      chart.remove()
      chartRef.current = null
    }
  }, [kind])

  useEffect(() => {
    const data = kind === 'rsi' ? QQQ_RSI : QQQ_ROC
    if (chartRef.current) applyRange(chartRef.current, data.length, range)
  }, [range, kind])

  return (
    <div className="chart-wrap">
      <div ref={hostRef} className="chart-host" />
      <div ref={legendRef} className="chart-legend num" />
    </div>
  )
}
