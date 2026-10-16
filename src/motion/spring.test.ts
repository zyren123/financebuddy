import { describe, expect, it } from 'vitest'
import { advanceSpring, springs } from './spring'

function simulate(hz: number) {
  const position = [0, 500]
  const velocity = [0, 0]
  for (let i = 0; i < hz; i++) advanceSpring(position, velocity, [1, 10], 1 / hz, springs.morph)
  return { position, velocity }
}

describe('motion physics', () => {
  it('converges to the same values at 60 and 120 Hz', () => {
    const slow = simulate(60)
    const fast = simulate(120)
    expect(slow.position[0]).toBeCloseTo(1, 4)
    expect(slow.position[1]).toBeCloseTo(10, 3)
    expect(slow.position[1]).toBeCloseTo(fast.position[1], 5)
  })

  it('keeps momentum when the target reverses, then settles on the new target', () => {
    const position = [0]
    const velocity = [0]
    advanceSpring(position, velocity, [100], 0.08, springs.morph)
    const before = position[0]
    advanceSpring(position, velocity, [-100], 0.001, springs.morph)
    expect(position[0]).toBeGreaterThan(before)
    for (let i = 0; i < 120; i++) advanceSpring(position, velocity, [-100], 1 / 120, springs.morph)
    expect(position[0]).toBeCloseTo(-100, 3)
  })
})
