import { describe, expect, it } from 'vitest'
import { validateDashboardState } from '../dashboard/schema'
import type { CardConfig, DashboardState } from '../dashboard/types'
import factoryText from '../../public/default-dashboard.json?raw'
import { basisOf, FALLBACK_BASIS, sameBasis, symbolsOf } from './basis'

const factory = validateDashboardState(JSON.parse(factoryText))
const state = (cards: CardConfig[]): DashboardState => ({ version: 1, cards, layout: [] })

describe('readings 口径', () => {
  it('FALLBACK_BASIS 与出厂布局的第一张 Ratio ROC 卡一致', () => {
    const card = factory?.cards.find((c) => c.kind === 'ratioRoc')
    expect(card?.kind).toBe('ratioRoc')
    if (card?.kind !== 'ratioRoc') return
    expect(FALLBACK_BASIS).toEqual({ pairs: card.pairs, rocPeriod: card.rocPeriod })
  })

  it('取第一张 Ratio ROC 卡;没有卡回落出厂口径,pairs 为空只回落 pairs', () => {
    const custom = state([
      { id: 'a', kind: 'candle', symbol: 'SPY', range: '3y' },
      { id: 'b', kind: 'ratioRoc', pairs: [{ numerator: 'IWM', denominator: 'SPY' }], rocPeriod: 20, range: '3y' },
      { id: 'c', kind: 'ratioRoc', pairs: [{ numerator: 'XLE', denominator: 'SPY' }], rocPeriod: 10, range: '3y' },
    ])
    expect(basisOf(custom)).toEqual({ pairs: [{ numerator: 'IWM', denominator: 'SPY' }], rocPeriod: 20 })
    expect(basisOf(null)).toBe(FALLBACK_BASIS)
    expect(basisOf(state([{ id: 'a', kind: 'candle', symbol: 'SPY', range: '3y' }]))).toBe(FALLBACK_BASIS)
    expect(basisOf(state([{ id: 'b', kind: 'ratioRoc', pairs: [], rocPeriod: 20, range: '3y' }]))).toEqual({
      pairs: FALLBACK_BASIS.pairs,
      rocPeriod: 20,
    })
  })

  it('口径比较看周期、顺序与分子分母', () => {
    const swapped = { ...FALLBACK_BASIS, pairs: [...FALLBACK_BASIS.pairs].reverse() }
    expect(sameBasis(FALLBACK_BASIS, { pairs: FALLBACK_BASIS.pairs.map((p) => ({ ...p })), rocPeriod: 35 })).toBe(true)
    expect(sameBasis(FALLBACK_BASIS, { ...FALLBACK_BASIS, rocPeriod: 20 })).toBe(false)
    expect(sameBasis(FALLBACK_BASIS, swapped)).toBe(false)
    expect(sameBasis(FALLBACK_BASIS, { ...FALLBACK_BASIS, pairs: FALLBACK_BASIS.pairs.slice(0, 2) })).toBe(false)
  })

  it('symbol 集合覆盖所有卡片与口径,去重保序', () => {
    expect(symbolsOf(factory, basisOf(factory))).toEqual(['QQQ', 'VTV', 'SCHD', 'CGDV'])
    expect(symbolsOf(null, FALLBACK_BASIS)).toEqual(['VTV', 'QQQ', 'SCHD', 'CGDV'])
    const s = state([
      { id: 'a', kind: 'indicator', symbol: 'TLT', indicator: 'rsi', period: 14, range: '3y' },
      { id: 'b', kind: 'candle', symbol: 'QQQ', range: '3y' },
    ])
    expect(symbolsOf(s, basisOf(s))).toEqual(['TLT', 'QQQ', 'VTV', 'SCHD', 'CGDV'])
  })
})
