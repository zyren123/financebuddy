const ready = (value, date) => ({ status: 'ready', value, date })
export const SOURCE_DOWN = { status: 'unavailable', reason: 'source-down' }

export function readingsSnapshot({ date = '2026-10-15', ratios = [-3.2, 1.4, -0.6], market = {} } = {}) {
  const pairs = [['VTV', 'QQQ'], ['SCHD', 'QQQ'], ['CGDV', 'QQQ']]
  const index = (pe, percentile) => ({ rsi: ready(55.2, date), drawdown: ready(-4.1, date), pe: ready(pe, date), percentile: ready(percentile, date) })
  return {
    computedAt: Date.now(),
    rocPeriod: 35,
    ratios: pairs.map(([numerator, denominator], i) => ({
      pair: { numerator, denominator },
      roc: ready(ratios[i], date),
      previous: ratios[i] / 2,
    })),
    market: {
      indices: { sp500: index(25.1, 0), nasdaq100: index(30.04, 45.08) },
      vix: ready(16.42, date),
      fearGreed: ready(42, date),
      ...market,
    },
    bars: Object.fromEntries(['QQQ', 'VTV', 'SCHD', 'CGDV'].map((s) => [s, date])),
  }
}
