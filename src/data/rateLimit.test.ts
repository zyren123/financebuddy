import { describe, expect, it, vi } from 'vitest'
import { acquireCredit } from './rateLimit'

describe('acquireCredit(8 credits/min 滑动窗口)', () => {
  it('窗口内前 8 个立即放行,第 9 个等到最早的过期后才放行', async () => {
    vi.useFakeTimers()
    const t0 = Date.now()

    // 前 8 个应当立即完成
    for (let i = 0; i < 8; i++) {
      await acquireCredit()
    }

    // 第 9 个应挂起等待
    let released = false
    const ninth = acquireCredit().then(() => {
      released = true
    })
    await Promise.resolve() // 让 microtask 跑一轮
    expect(released).toBe(false)

    // 推进到第一个时间戳滑出窗口(60s + 一点余量)
    await vi.advanceTimersByTimeAsync(60_100)
    expect(t0 + 60_000 <= Date.now()).toBe(true)
    await ninth
    expect(released).toBe(true)

    vi.useRealTimers()
  })
})
