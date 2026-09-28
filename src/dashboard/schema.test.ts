import { describe, expect, it } from 'vitest'
import { validateDashboardState } from './schema'
import type { IndicatorCardConfig, RatioRocCardConfig } from './types'

// 与 public/default-dashboard.json 同构的合法输入(带脏字段,验证规整)
const valid = {
  version: 1,
  cards: [
    { id: 'a', kind: 'candle', symbol: 'qqq', range: '3y' },
    {
      id: 'b',
      kind: 'ratioRoc',
      rocPeriod: 2.7,
      pairs: [
        { numerator: 'vtv', denominator: 'QQQ' },
        { numerator: '', denominator: 'X' },
      ],
      range: '1y',
    },
    { id: 'c', kind: 'indicator', symbol: 'QQQ', indicator: 'rsi', period: 0.4, range: 'max' },
  ],
  layout: [{ i: 'a', x: 0, y: 0, w: 6, h: 10 }, { i: 'ghost', x: 1, y: 1, w: 2, h: 2 }, 'junk'],
}

describe('validateDashboardState(布局 schema)', () => {
  it('合法输入通过并规整:大写、clamp、round、过滤脏 pairs / 脏 layout 项', () => {
    const state = validateDashboardState(valid)
    expect(state).not.toBeNull()
    expect(state!.cards[0]).toEqual({ id: 'a', kind: 'candle', symbol: 'QQQ', range: '3y' })
    expect((state!.cards[1] as RatioRocCardConfig).rocPeriod).toBe(3)
    expect((state!.cards[1] as RatioRocCardConfig).pairs).toEqual([{ numerator: 'VTV', denominator: 'QQQ' }])
    expect((state!.cards[2] as IndicatorCardConfig).period).toBe(1)
    expect(state!.layout).toEqual([
      { i: 'a', x: 0, y: 0, w: 6, h: 10, minW: 3, minH: 4 },
      { i: 'ghost', x: 1, y: 1, w: 2, h: 2, minW: 3, minH: 4 },
    ])
  })

  it('version 不是 1 → null', () => {
    expect(validateDashboardState({ ...valid, version: 2 })).toBeNull()
  })

  it('外层非对象 / cards 非数组 / cards 为空 → null', () => {
    expect(validateDashboardState('x')).toBeNull()
    expect(validateDashboardState(null)).toBeNull()
    expect(validateDashboardState({ version: 1 })).toBeNull()
    expect(validateDashboardState({ version: 1, cards: [] })).toBeNull()
  })

  it('非法 range 与未知 indicator 的卡片被剔除,剔空则整体 null', () => {
    expect(validateDashboardState({ ...valid, cards: [{ ...valid.cards[0], range: '7y' }] })).toBeNull()
    expect(
      validateDashboardState({ ...valid, cards: [{ ...valid.cards[2], indicator: 'macd' }] }),
    ).toBeNull()
  })

  it('ratioRoc 的 pairs 全坏 → null', () => {
    expect(
      validateDashboardState({
        version: 1,
        cards: [{ ...valid.cards[1], pairs: [{ numerator: '', denominator: '' }] }],
      }),
    ).toBeNull()
  })

  it('layout 缺失 → 空布局(卡片仍在)', () => {
    const state = validateDashboardState({ version: 1, cards: [valid.cards[0]] })
    expect(state).toEqual({ version: 1, cards: [state!.cards[0]], layout: [] })
  })
})
