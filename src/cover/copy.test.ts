import { describe, expect, it } from 'vitest'
import { headlineOf, leadOf } from './copy'
import type { RatioReading } from '../data/useRatioReadings'

const r = (label: string, value: number): RatioReading => ({ label, value, previous: null, date: '2026-10-08' })

describe('cover copy', () => {
  it('三条都为负且分母是 QQQ:成长领先', () => {
    const rs = [r('VTV/QQQ', -7.3), r('SCHD/QQQ', -9.51), r('CGDV/QQQ', -6.29)]
    expect(headlineOf(rs)).toBe('成长领先')
    expect(leadOf(rs, 35)).toBe('VTV、SCHD、CGDV 相对 QQQ 的 35 日比值动量全部为负。')
  })

  it('全正:价值领先', () => {
    expect(headlineOf([r('VTV/QQQ', 1), r('SCHD/QQQ', 2)])).toBe('价值领先')
  })

  it('有正有负:风格分化,并点名两侧', () => {
    const rs = [r('VTV/QQQ', 1.2), r('SCHD/QQQ', -0.4)]
    expect(headlineOf(rs)).toBe('风格分化')
    expect(leadOf(rs, 35)).toBe('相对 QQQ，VTV 为正，SCHD 为负。')
  })

  it('分母不是成长基准时不臆断风格', () => {
    expect(headlineOf([r('XLE/SPY', -2)])).toBe('SPY领先')
  })

  it('没有读数时不生成结论', () => {
    expect(headlineOf([])).toBeNull()
  })
})
