import { useEffect, useRef } from 'react'
import { ColorType, CrosshairMode, createChart } from 'lightweight-charts'
import type { IChartApi } from 'lightweight-charts'
import { CHART_COLORS } from './theme'

/** 创建带暗色主题的 lightweight-charts 实例,自动跟随容器尺寸,卸载时销毁 */
export function useChart() {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: CHART_COLORS.surface },
        textColor: CHART_COLORS.muted,
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: CHART_COLORS.grid },
        horzLines: { color: CHART_COLORS.grid },
      },
      rightPriceScale: {
        borderColor: CHART_COLORS.edge,
        // 顶部留 8% 余量,避免最高一档刻度(如 RSI 的 100.0)被卡片上缘裁切
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      // 显式声明手势(默认即如此,写明防漂移):
      // 滚轮/双指捏合缩放、按住拖拽平移、按住坐标轴拖拽缩放、双击轴复位
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      timeScale: { borderColor: CHART_COLORS.edge, timeVisible: false, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
    })
    chartRef.current = chart
    return () => {
      chart.remove()
      chartRef.current = null
    }
  }, [])

  return { containerRef, chartRef }
}
