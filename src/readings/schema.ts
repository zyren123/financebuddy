import { readArray, readDate, readNumber, readObject } from '../market/schema.js'
import type { IndexReadings, Item, MarketReadings, RatioItem, ReadingsSnapshot } from './model.js'

const SYMBOL_RE = /^[A-Za-z0-9.\-:/]{1,20}$/

function readSymbol(value: unknown): string {
  if (typeof value !== 'string' || !SYMBOL_RE.test(value)) throw new Error('Ticker 无效')
  return value
}

function parseItem(value: unknown): Item {
  const body = readObject(value)
  if (body.status === 'ready') return { status: 'ready', value: readNumber(body.value), date: readDate(body.date) }
  if (body.status === 'unavailable' && (body.reason === 'source-down' || body.reason === 'insufficient')) {
    return { status: 'unavailable', reason: body.reason }
  }
  throw new Error('读数状态无效')
}

function parseRatioItem(value: unknown): RatioItem {
  const body = readObject(value)
  const pair = readObject(body.pair)
  return {
    pair: { numerator: readSymbol(pair.numerator), denominator: readSymbol(pair.denominator) },
    roc: parseItem(body.roc),
    previous: body.previous === null ? null : readNumber(body.previous),
  }
}

function parseIndex(value: unknown): IndexReadings {
  const body = readObject(value)
  return { rsi: parseItem(body.rsi), drawdown: parseItem(body.drawdown), pe: parseItem(body.pe), percentile: parseItem(body.percentile) }
}

function parseMarket(value: unknown): MarketReadings {
  const body = readObject(value)
  const indices = readObject(body.indices)
  return {
    indices: { sp500: parseIndex(indices.sp500), nasdaq100: parseIndex(indices.nasdaq100) },
    vix: parseItem(body.vix),
    fearGreed: parseItem(body.fearGreed),
  }
}

export function parseReadingsSnapshot(value: unknown): ReadingsSnapshot {
  const body = readObject(value)
  const rocPeriod = readNumber(body.rocPeriod)
  if (!Number.isInteger(rocPeriod) || rocPeriod < 1) throw new Error('ROC 周期无效')
  return {
    computedAt: readNumber(body.computedAt),
    rocPeriod,
    ratios: readArray(body.ratios).map(parseRatioItem),
    market: parseMarket(body.market),
    bars: Object.fromEntries(Object.entries(readObject(body.bars)).map(([symbol, date]) => [readSymbol(symbol), readDate(date)])),
  }
}
