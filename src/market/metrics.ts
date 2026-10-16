import { rsi } from '../indicators/momentum'
import type { PriceBar } from './model'

export function priceMetrics(bars: PriceBar[]) {
  const latest = bars.at(-1)
  if (!latest) return { rsi: null, drawdown: null }
  const rsiValue = rsi(bars.map((bar) => ({ datetime: bar.date, value: bar.close })), 6).at(-1)?.value
  const since = new Date(Date.parse(latest.date) - 52 * 7 * 86_400_000).toISOString().slice(0, 10)
  const coversYear = bars[0].date <= since
  const high = Math.max(...bars.filter((bar) => bar.date >= since).map((bar) => bar.high))
  return {
    rsi: rsiValue !== undefined && Number.isFinite(rsiValue) ? { value: rsiValue, date: latest.date } : null,
    drawdown: coversYear && high > 0 ? { value: Math.min(0, (latest.close / high - 1) * 100), date: latest.date } : null,
  }
}
