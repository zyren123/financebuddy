import type { Bar } from '../data/types.js'
import { ratioRoc } from '../indicators/ratio.js'
import { priceMetrics } from '../market/metrics.js'
import type { IndexId, MarketData, MarketFeed, PriceFeed } from '../market/model.js'
import type { IndexReadings, Item, MarketReadings, RatioItem, ReadingsBasis, ReadingsSnapshot } from './model.js'

type PriceData = Extract<MarketData, { bars: unknown }>

/** 每个 feed 对应它自己的 MarketData 变体;拉不到为 null */
export type MarketInputs = {
  [F in MarketFeed]: (F extends PriceFeed ? PriceData : Extract<MarketData, { feed: F }>) | null
}

/** symbol → 旧→新 的完整日线;拉不到的 symbol 不在 map 里 */
export type BarsBySymbol = ReadonlyMap<string, Bar[]>

const SOURCE_DOWN: Item = { status: 'unavailable', reason: 'source-down' }
const INSUFFICIENT: Item = { status: 'unavailable', reason: 'insufficient' }

const ready = (value: { value: number; date: string } | null): Item =>
  value ? { status: 'ready', ...value } : INSUFFICIENT

export function ratioItems(bars: BarsBySymbol, basis: ReadingsBasis): RatioItem[] {
  return basis.pairs.map((pair) => {
    const num = bars.get(pair.numerator)
    const den = bars.get(pair.denominator)
    if (!num || !den) return { pair, roc: SOURCE_DOWN, previous: null }
    const pts = ratioRoc(num, den, basis.rocPeriod)
    const last = pts.at(-1)
    if (!last || !Number.isFinite(last.value)) return { pair, roc: INSUFFICIENT, previous: null }
    const prev = pts.at(-1 - basis.rocPeriod)
    return {
      pair,
      roc: { status: 'ready', value: last.value, date: last.datetime },
      previous: prev && Number.isFinite(prev.value) ? prev.value : null,
    }
  })
}

function indexReadings(prices: PriceData | null, valuations: MarketInputs['valuations'], index: IndexId): IndexReadings {
  const metrics = prices ? priceMetrics(prices.bars) : null
  const row = valuations?.indices.find((item) => item.index === index)
  return {
    rsi: metrics ? ready(metrics.rsi) : SOURCE_DOWN,
    drawdown: metrics ? ready(metrics.drawdown) : SOURCE_DOWN,
    pe: valuations ? ready(row?.pe != null ? { value: row.pe, date: row.date } : null) : SOURCE_DOWN,
    percentile: valuations ? ready(row?.percentile != null ? { value: row.percentile, date: row.date } : null) : SOURCE_DOWN,
  }
}

export function marketReadings(inputs: MarketInputs): MarketReadings {
  const vixLast = inputs.vix?.bars.at(-1)
  const fearGreed = inputs['fear-greed']
  return {
    indices: {
      sp500: indexReadings(inputs.sp500, inputs.valuations, 'sp500'),
      nasdaq100: indexReadings(inputs.nasdaq100, inputs.valuations, 'nasdaq100'),
    },
    vix: inputs.vix ? ready(vixLast ? { value: vixLast.close, date: vixLast.date } : null) : SOURCE_DOWN,
    fearGreed: fearGreed ? ready({ value: fearGreed.score, date: fearGreed.date }) : SOURCE_DOWN,
  }
}

export function buildSnapshot(
  bars: BarsBySymbol,
  market: MarketInputs,
  basis: ReadingsBasis,
  computedAt: number,
): ReadingsSnapshot {
  return {
    computedAt,
    rocPeriod: basis.rocPeriod,
    ratios: ratioItems(bars, basis),
    market: marketReadings(market),
    bars: Object.fromEntries([...bars].flatMap(([symbol, b]) => {
      const last = b.at(-1)
      return last ? [[symbol, last.datetime]] : []
    })),
  }
}
