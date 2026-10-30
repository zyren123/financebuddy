import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCreditLimiter } from './credits'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-30T23:58:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('createCreditLimiter', () => {
  it('并发 10 次:前 8 次立即放行,其余排到下一分钟', async () => {
    const limiter = createCreditLimiter({ perMinute: 8, perDay: 750 })
    const grantedAt: number[] = []
    const all = Array.from({ length: 10 }, () => limiter.acquire().then((ok) => {
      expect(ok).toBe(true)
      grantedAt.push(Date.now())
    }))
    await vi.advanceTimersByTimeAsync(0)
    expect(grantedAt).toHaveLength(8)
    await vi.advanceTimersByTimeAsync(59_000)
    expect(grantedAt).toHaveLength(8)
    await vi.advanceTimersByTimeAsync(1_100)
    await Promise.all(all)
    expect(grantedAt).toHaveLength(10)
    const start = grantedAt[0]!
    for (const t of grantedAt) {
      expect(grantedAt.filter((u) => u >= t && u < t + 60_000).length).toBeLessThanOrEqual(8)
    }
    expect(grantedAt.at(-1)! - start).toBeGreaterThanOrEqual(60_000)
  })

  it('当天额度用完立即返回 false,UTC 换日后恢复', async () => {
    const limiter = createCreditLimiter({ perMinute: 100, perDay: 3 })
    expect(await Promise.all([1, 2, 3].map(() => limiter.acquire()))).toEqual([true, true, true])
    expect(await limiter.acquire()).toBe(false)
    await vi.advanceTimersByTimeAsync(2 * 60_000)
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-10-31')
    expect(await limiter.acquire()).toBe(true)
  })

  it('排队中的请求醒来时再查日额度,不超发', async () => {
    vi.setSystemTime(new Date('2026-10-30T12:00:00Z'))
    const limiter = createCreditLimiter({ perMinute: 1, perDay: 2 })
    const results = Promise.all([1, 2, 3].map(() => limiter.acquire()))
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(60_100)
    await vi.advanceTimersByTimeAsync(60_100)
    expect((await results).filter(Boolean)).toHaveLength(2)
  })
})
