// lightweight-charts 5 公共配置 + 时间范围快捷切换
import { CrosshairMode, type ChartOptions, type DeepPartial, type IChartApi } from 'lightweight-charts'
import { COLORS } from '../theme'

export const baseOptions: DeepPartial<ChartOptions> = {
  autoSize: true,
  layout: {
    background: { color: COLORS.panel },
    textColor: COLORS.textDim,
    fontFamily: "-apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    fontSize: 11,
    panes: { separatorColor: COLORS.border },
  },
  grid: {
    vertLines: { color: 'rgba(42, 46, 57, 0.6)' },
    horzLines: { color: 'rgba(42, 46, 57, 0.6)' },
  },
  crosshair: {
    mode: CrosshairMode.Normal,
    vertLine: { color: COLORS.border2, style: 3, labelBackgroundColor: COLORS.border },
    horzLine: { color: COLORS.border2, style: 3, labelBackgroundColor: COLORS.border },
  },
  rightPriceScale: { borderColor: COLORS.border, entireTextOnly: true },
  timeScale: { borderColor: COLORS.border, rightOffset: 4, barSpacing: 7, minBarSpacing: 1.5 },
}

export type RangeKey = '6M' | '1Y' | '3Y' | '5Y' | 'Max'
export const RANGES: RangeKey[] = ['6M', '1Y', '3Y', '5Y', 'Max']
const RANGE_BARS = { '6M': 126, '1Y': 252, '3Y': 756, '5Y': 1260 } as const

export function applyRange(chart: IChartApi, dataLength: number, range: RangeKey) {
  if (range === 'Max' || dataLength <= RANGE_BARS[range]) {
    chart.timeScale().fitContent()
    return
  }
  chart.timeScale().setVisibleLogicalRange({ from: dataLength - RANGE_BARS[range], to: dataLength - 1 + 4 })
}
