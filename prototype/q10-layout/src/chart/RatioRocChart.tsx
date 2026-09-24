// Ratio ROC 卡:多条 Ratio 的同周期 ROC 画在同一坐标系(本项目第一个自定义指标)
import { useEffect, useRef } from 'react'
import {
  LineSeries,
  LineStyle,
  createChart,
  createTextWatermark,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type Time,
} from 'lightweight-charts'
import { RATIO_ROC_LINES } from '../cards'
import { COLORS } from '../theme'
import { applyRange, baseOptions, type RangeKey } from './chartBase'

const pctFmt = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`

export default function RatioRocChart({ range }: { range: RangeKey }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const legendRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useEffect(() => {
    const chart = createChart(hostRef.current!, baseOptions)
    chartRef.current = chart

    const series: ISeriesApi<'Line'>[] = RATIO_ROC_LINES.map((d) =>
      chart.addSeries(LineSeries, {
        color: d.color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        priceFormat: { type: 'custom', formatter: pctFmt, minMove: 0.1 },
        crosshairMarkerBorderColor: COLORS.panel,
      }),
    )
    series.forEach((s, i) =>
      s.setData(RATIO_ROC_LINES[i].data.map((p) => ({ time: p.time as Time, value: p.value }))),
    )

    // 零轴(所有 Ratio ROC 共用一条)
    series[0].createPriceLine({
      price: 0,
      color: 'rgba(120,123,134,0.7)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: false,
      title: '',
    })

    createTextWatermark(chart.panes()[0], {
      horzAlign: 'center',
      vertAlign: 'center',
      lines: [{ text: 'Ratio ROC 35 · MOCK', color: 'rgba(120,123,134,0.2)', fontSize: 40 }],
    })

    // legend:三个 chip,十字线悬停时显示对应值
    const lastVals = RATIO_ROC_LINES.map((d) => d.data[d.data.length - 1]?.value)
    const render = (vals: Array<number | undefined> | null) => {
      const el = legendRef.current
      if (!el) return
      const vs = vals ?? lastVals
      el.innerHTML = RATIO_ROC_LINES.map(
        (d, i) =>
          `<span class="chip"><i style="background:${d.color}"></i>${d.label} ` +
          `<span class="num">${vs[i] == null ? '—' : pctFmt(vs[i]!)}</span></span>`,
      ).join('')
    }
    render(null)
    chart.subscribeCrosshairMove((p) => {
      if (!p.time) {
        render(null)
        return
      }
      render(series.map((s) => (p.seriesData.get(s) as LineData | undefined)?.value))
    })

    return () => {
      chart.remove()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    if (chartRef.current) applyRange(chartRef.current, RATIO_ROC_LINES[0].data.length, range)
  }, [range])

  return (
    <div className="chart-wrap">
      <div ref={hostRef} className="chart-host" />
      <div ref={legendRef} className="chart-legend num" />
    </div>
  )
}
