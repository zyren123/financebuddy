import type { IChartApi, UTCTimestamp } from 'lightweight-charts'
import { dateToTs, rangeStartTs } from './convert'
import type { RangeKey } from './convert'
import { createSpring } from '../motion/spring'

const transitions = new WeakMap<IChartApi, ReturnType<typeof createSpring>>()

export function cancelRangeMotion(chart: IChartApi) {
  transitions.get(chart)?.stop()
  transitions.delete(chart)
}

/** 把时间快捷键应用到图表:max 全量自适应,其余以最后一根 K 为锚往回看 */
export function applyRange(chart: IChartApi, lastDate: string, range: RangeKey) {
  const lastTs = dateToTs(lastDate)
  const from = rangeStartTs(range, lastTs)
  const scale = chart.timeScale()
  const start = scale.getVisibleLogicalRange()
  // Setters are applied on the chart's next draw. Reading immediately after a
  // setter returns the old range, so resolve the destination from data indices.
  const endIndex = scale.timeToIndex(lastTs, true)
  const startIndex = from == null ? 0 : scale.timeToIndex(from as UTCTimestamp, true)
  if (startIndex == null || endIndex == null) return
  const end = { from: Number(startIndex), to: Number(endIndex) }
  if (!start) {
    scale.setVisibleLogicalRange(end)
    return
  }
  if (start.from === end.from && start.to === end.to) return
  let spring = transitions.get(chart)
  if (!spring) {
    spring = createSpring([start.from, start.to], ([left, right]) => {
      scale.setVisibleLogicalRange({ from: left, to: Math.max(left + 0.01, right) })
    })
    transitions.set(chart, spring)
  }
  spring.set([end.from, end.to])
}
