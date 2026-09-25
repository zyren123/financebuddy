import type { IChartApi, UTCTimestamp } from 'lightweight-charts'
import { dateToTs, rangeStartTs } from './convert'
import type { RangeKey } from './convert'

/** 把时间快捷键应用到图表:max 全量自适应,其余以最后一根 K 为锚往回看 */
export function applyRange(chart: IChartApi, lastDate: string, range: RangeKey) {
  const lastTs = dateToTs(lastDate)
  const from = rangeStartTs(range, lastTs)
  if (from == null) {
    chart.timeScale().fitContent()
    return
  }
  chart.timeScale().setVisibleRange({ from: from as UTCTimestamp, to: lastTs })
}
