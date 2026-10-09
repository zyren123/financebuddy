import { describe, expect, it } from 'vitest'
import { CENTER, INNER, OUTER, emitAngle, radiusOf, ringScale, track } from './geometry'

describe('ringScale', () => {
  it('最大读数落在最外环之内,至少 3 环', () => {
    const { step, rings } = ringScale([-7.3, -9.51, -6.29])
    expect(step * rings).toBeGreaterThanOrEqual(9.51)
    expect(rings).toBeGreaterThanOrEqual(3)
    expect(rings).toBeLessThanOrEqual(6)
  })

  it('极端读数换更大档距,环数不超过 6', () => {
    const { step, rings } = ringScale([42])
    expect(rings).toBeLessThanOrEqual(6)
    expect(step * rings).toBeGreaterThanOrEqual(42)
  })
})

describe('radiusOf', () => {
  it('|ROC| 越大打得越远,且正负对称', () => {
    expect(radiusOf(-9.51, 2, 5)).toBeGreaterThan(radiusOf(-6.29, 2, 5))
    expect(radiusOf(5, 2, 5)).toBeCloseTo(radiusOf(-5, 2, 5))
  })

  it('落在 INNER..OUTER 之间,超量程截在最外环', () => {
    expect(radiusOf(0, 2, 5)).toBe(INNER)
    expect(radiusOf(999, 2, 5)).toBe(OUTER)
  })

  it('读数正好等于第 k 环的档位时,终点落在第 k 环上', () => {
    const step = 2
    const rings = 5
    const ring3 = INNER + (3 / rings) * (OUTER - INNER)
    expect(radiusOf(-6, step, rings)).toBeCloseTo(ring3)
  })
})

describe('track', () => {
  it('终点到顶点的距离等于读数对应半径', () => {
    const t = track(-7.3, emitAngle(0, 3), 2, 5)
    expect(Math.hypot(t.end.x - CENTER, t.end.y - CENTER)).toBeCloseTo(t.radius)
  })

  it('正负值向相反方向偏转', () => {
    const emit = emitAngle(1, 3)
    const neg = track(-5, emit, 2, 5)
    const pos = track(5, emit, 2, 5)
    expect(neg.angle).toBeGreaterThan(emit)
    expect(pos.angle).toBeLessThan(emit)
    expect(neg.d).toContain(' 0 0 1 ')
    expect(pos.d).toContain(' 0 0 0 ')
  })
})
