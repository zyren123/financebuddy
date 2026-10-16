import { describe, expect, it } from 'vitest'
import { priceMetrics } from './metrics'

describe('美股指数读数', () => {
  it('RSI(6) 使用已有 Wilder 引擎，52 周回撤按最高日内价计算', () => {
    const bars = Array.from({ length: 370 }, (_, i) => ({
      date: new Date(Date.UTC(2025, 9, 11) + i * 86400000).toISOString().slice(0, 10),
      close: 100 + i,
      high: 110 + i,
    }))
    const result = priceMetrics(bars)
    expect(result.rsi).toEqual({ value: 100, date: '2026-10-15' })
    expect(result.drawdown?.value).toBeCloseTo((469 / 479 - 1) * 100, 10)
    expect(result.drawdown?.date).toBe('2026-10-15')
  })

  it('52 周以前的极高价格不进入回撤计算', () => {
    const bars = Array.from({ length: 370 }, (_, i) => ({
      date: new Date(Date.UTC(2025, 9, 11) + i * 86400000).toISOString().slice(0, 10),
      close: 90,
      high: i < 5 ? 1000 : 100,
    }))
    expect(priceMetrics(bars).drawdown?.value).toBeCloseTo(-10, 10)
  })

  it('历史不足时保持缺失，不用部分历史伪装成 52 周或 RSI(6)', () => {
    expect(priceMetrics([])).toEqual({ rsi: null, drawdown: null })
    const result = priceMetrics([{ date: '2026-10-15', close: 100, high: 101 }])
    expect(result).toEqual({ rsi: null, drawdown: null })
  })
})
