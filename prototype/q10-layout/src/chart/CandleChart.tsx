// K 线卡:单 Ticker 蜡烛图 + 成交量副 pane + 十字线 legend + 水印
import { useEffect, useRef } from 'react'
import {
  CandlestickSeries,
  HistogramSeries,
  LineStyle,
  createChart,
  createTextWatermark,
  type IChartApi,
  type Time,
} from 'lightweight-charts'
import { BARS, type Bar, type TickerKey } from '../mock/data'
import { COLORS } from '../theme'
import { applyRange, baseOptions, type RangeKey } from './chartBase'

export default function CandleChart({ ticker, range }: { ticker: TickerKey; range: RangeKey }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const legendRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useEffect(() => {
    const host = hostRef.current!
    const bars: Bar[] = BARS[ticker]
    const chart = createChart(host, baseOptions)
    chartRef.current = chart

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: COLORS.up,
      downColor: COLORS.down,
      wickUpColor: COLORS.up,
      wickDownColor: COLORS.down,
      borderVisible: false,
    })
    candles.setData(
      bars.map((b) => ({ time: b.time as Time, open: b.open, high: b.high, low: b.low, close: b.close })),
    )

    const vol = chart.addSeries(
      HistogramSeries,
      { priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false },
      1, // 成交量放第二个 pane
    )
    vol.setData(
      bars.map((b) => ({
        time: b.time as Time,
        value: b.volume,
        color: b.close >= b.open ? 'rgba(38,166,154,0.5)' : 'rgba(239,83,80,0.5)',
      })),
    )
    chart.panes()[1]?.setHeight(84)

    candles.createPriceLine({
      price: bars[bars.length - 1].close,
      color: 'rgba(120,123,134,0.45)',
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: false,
      title: '',
    })

    createTextWatermark(chart.panes()[0], {
      horzAlign: 'center',
      vertAlign: 'center',
      lines: [{ text: `${ticker} · 1D · MOCK`, color: 'rgba(120,123,134,0.2)', fontSize: 44 }],
    })

    // 十字线 legend:直接写 DOM,避免高频 setState(TradingView 顶部行情条样式)
    const byTime = new Map(bars.map((b) => [b.time, b]))
    const last = bars[bars.length - 1]
    const render = (b: Bar) => {
      const el = legendRef.current
      if (!el) return
      const chg = (b.close / b.open - 1) * 100
      const cls = chg >= 0 ? 'up' : 'down'
      el.innerHTML =
        `<b>${ticker}</b> <span>1D</span>` +
        ` <span>O <span class="num ${cls}">${b.open.toFixed(2)}</span></span>` +
        ` <span>H <span class="num ${cls}">${b.high.toFixed(2)}</span></span>` +
        ` <span>L <span class="num ${cls}">${b.low.toFixed(2)}</span></span>` +
        ` <span>C <span class="num ${cls}">${b.close.toFixed(2)}</span></span>` +
        ` <span class="num ${cls}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</span>` +
        ` <span>V <span class="num">${(b.volume / 1e6).toFixed(1)}M</span></span>`
    }
    render(last)
    chart.subscribeCrosshairMove((p) => {
      render(p.time ? (byTime.get(p.time as string) ?? last) : last)
    })

    return () => {
      chart.remove()
      chartRef.current = null
    }
  }, [ticker])

  useEffect(() => {
    if (chartRef.current) applyRange(chartRef.current, BARS[ticker].length, range)
  }, [range, ticker])

  return (
    <div className="chart-wrap">
      <div ref={hostRef} className="chart-host" />
      <div ref={legendRef} className="chart-legend num" />
    </div>
  )
}
