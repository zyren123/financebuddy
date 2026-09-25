import { useEffect, useRef, useState } from 'react'
import { CandlestickSeries, HistogramSeries, createTextWatermark } from 'lightweight-charts'
import type { ISeriesApi, MouseEventParams, Time } from 'lightweight-charts'
import type { Bar } from '../data/types'
import { candleData, dateToTs, tsToDate, volumeData } from './convert'
import type { RangeKey } from './convert'
import { applyRange } from './range'
import { CHART_COLORS } from './theme'
import { useChart } from './useChart'

const VOLUME_PANE_HEIGHT = 88

interface Hover {
  date: string
  bar: Bar
}

const compact = new Intl.NumberFormat('zh-CN', { notation: 'compact' })
const fmt2 = (v: number) => v.toFixed(2)

/** K 线卡:蜡烛(主 pane)+ 成交量(副 pane)+ 水印 + 十字线联动 OHLC 读数 */
export function CandlestickChart({
  symbol,
  bars,
  range,
}: {
  symbol: string
  bars: Bar[]
  range: RangeKey
}) {
  const { containerRef, chartRef } = useChart()
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const barsByTs = useRef(new Map<number, Bar>())
  const [hover, setHover] = useState<Hover | null>(null)

  // 建图与序列(挂载 / 换 symbol 时重建,水印需要 symbol)
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    const candle = chart.addSeries(
      CandlestickSeries,
      {
        upColor: CHART_COLORS.up,
        downColor: CHART_COLORS.down,
        borderVisible: false,
        wickUpColor: CHART_COLORS.up,
        wickDownColor: CHART_COLORS.down,
      },
      0,
    )
    const volume = chart.addSeries(
      HistogramSeries,
      { priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false },
      1,
    )
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0 } })
    chart.panes()[1]?.setHeight(VOLUME_PANE_HEIGHT)
    createTextWatermark(chart.panes()[0]!, {
      horzAlign: 'center',
      vertAlign: 'center',
      lines: [{ text: symbol, color: 'rgba(209, 212, 220, 0.07)', fontSize: 46 }],
    })

    candleRef.current = candle
    volumeRef.current = volume

    const onMove = (param: MouseEventParams<Time>) => {
      const bar = param.time != null ? barsByTs.current.get(param.time as number) : undefined
      setHover(bar ? { date: tsToDate(param.time as number), bar } : null)
    }
    chart.subscribeCrosshairMove(onMove)
    return () => {
      chart.unsubscribeCrosshairMove(onMove)
      candleRef.current = null
      volumeRef.current = null
    }
  }, [symbol])

  // 数据与可见范围
  useEffect(() => {
    const chart = chartRef.current
    const candle = candleRef.current
    const volume = volumeRef.current
    if (!chart || !candle || !volume || bars.length === 0) return

    barsByTs.current = new Map(bars.map((b) => [dateToTs(b.datetime), b]))
    candle.setData(candleData(bars))
    volume.setData(volumeData(bars))
    applyRange(chart, bars[bars.length - 1]!.datetime, range)
  }, [bars, range])

  // 无十字线时显示最后一根
  const shown = hover ?? (bars.length > 0 ? { date: bars[bars.length - 1]!.datetime, bar: bars[bars.length - 1]! } : null)
  const rising = shown ? shown.bar.close >= shown.bar.open : true

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="chart-surface h-full w-full" />
      {shown && (
        <div className="pointer-events-none absolute left-2 top-1.5 z-10 flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded bg-surface/70 px-1 py-0.5 text-[11px] tabular-nums backdrop-blur-[2px]">
          <span className="font-semibold text-ink">{symbol}</span>
          <span className="text-ink-muted">{shown.date}</span>
          <span className="text-ink-muted">
            O <span className="text-ink">{fmt2(shown.bar.open)}</span>
          </span>
          <span className="text-ink-muted">
            H <span className="text-ink">{fmt2(shown.bar.high)}</span>
          </span>
          <span className="text-ink-muted">
            L <span className="text-ink">{fmt2(shown.bar.low)}</span>
          </span>
          <span className="text-ink-muted">
            C <span className={rising ? 'text-up' : 'text-down'}>{fmt2(shown.bar.close)}</span>
          </span>
          {shown.bar.volume != null && (
            <span className="text-ink-muted">
              量 <span className="text-ink">{compact.format(shown.bar.volume)}</span>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
