import type { IndexId, MarketData, MarketFeed } from './model.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readObject(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('数据格式不匹配')
  return value
}

export function readArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('数据列表缺失')
  return value
}

export function readNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('读数无效')
  return value
}

export function readDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('数据日期缺失')
  const time = Date.parse(value)
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) throw new Error('数据日期无效')
  return value
}

function readIndex(value: unknown): IndexId {
  if (value !== 'sp500' && value !== 'nasdaq100') throw new Error('指数代码不匹配')
  return value
}

function optionalPositive(value: unknown): number | null {
  if (value === null) return null
  const number = readNumber(value)
  if (number <= 0) throw new Error('估值读数无效')
  return number
}

function percentile(value: unknown): number | null {
  if (value === null) return null
  const number = readNumber(value)
  if (number < 0 || number > 100) throw new Error('百分位读数无效')
  return number
}

export function parseMarketData(feed: MarketFeed, value: unknown): MarketData {
  const body = readObject(value)
  if (body.feed !== feed) throw new Error('数据来源不匹配')
  switch (feed) {
    case 'sp500':
    case 'nasdaq100':
    case 'vix': {
      const bars = readArray(body.bars).map((raw) => {
        const bar = readObject(raw)
        const close = readNumber(bar.close)
        const high = readNumber(bar.high)
        if (close <= 0 || high < close) throw new Error('价格读数无效')
        return { date: readDate(bar.date), close, high }
      })
      if (!bars.length || bars.some((bar, i) => i > 0 && bar.date <= bars[i - 1].date)) throw new Error('日线日期不连续或重复')
      return { feed, bars }
    }
    case 'valuations': {
      const indices = readArray(body.indices).map((raw) => {
        const row = readObject(raw)
        return { index: readIndex(row.index), date: readDate(row.date), pe: optionalPositive(row.pe), percentile: percentile(row.percentile) }
      })
      if (!indices.length || new Set(indices.map((row) => row.index)).size !== indices.length) throw new Error('估值列表无效')
      return { feed, indices }
    }
    case 'fear-greed': {
      const score = readNumber(body.score)
      if (score < 0 || score > 100) throw new Error('情绪指数读数无效')
      return { feed, score, date: readDate(body.date) }
    }
  }
}
