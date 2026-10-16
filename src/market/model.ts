export const MARKET_FEEDS = ['sp500', 'nasdaq100', 'vix', 'valuations', 'fear-greed'] as const
export type MarketFeed = (typeof MARKET_FEEDS)[number]
export type IndexId = 'sp500' | 'nasdaq100'
export type PriceFeed = IndexId | 'vix'

export interface PriceBar {
  date: string
  close: number
  high: number
}

export interface IndexValuation {
  index: IndexId
  date: string
  pe: number | null
  percentile: number | null
}

export type MarketData =
  | { feed: PriceFeed; bars: PriceBar[] }
  | { feed: 'valuations'; indices: IndexValuation[] }
  | { feed: 'fear-greed'; date: string; score: number }

export const MARKET_SOURCES = {
  yahoo: { name: 'Yahoo Finance', url: 'https://finance.yahoo.com/quote/%5EGSPC/' },
  danjuan: { name: '蛋卷基金', url: 'https://danjuanfunds.com/djmodule/value-center' },
  cnn: { name: 'CNN', url: 'https://www.cnn.com/markets/fear-and-greed' },
}
