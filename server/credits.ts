export interface CreditLimiter {
  /** 等到本分钟有余量后扣 1 个;当天(UTC)额度用完返回 false,不等到明天 */
  acquire(): Promise<boolean>
}

export interface CreditBudget {
  perMinute: number
  perDay: number
}

export const FREE_TIER: CreditBudget = { perMinute: 8, perDay: 750 }

const WINDOW_MS = 60_000

export function createCreditLimiter(
  budget: CreditBudget = FREE_TIER,
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): CreditLimiter {
  let stamps: number[] = []
  let day = ''
  let used = 0

  return {
    async acquire() {
      for (;;) {
        const t = now()
        const today = new Date(t).toISOString().slice(0, 10)
        if (today !== day) {
          day = today
          used = 0
        }
        if (used >= budget.perDay) return false
        stamps = stamps.filter((s) => t - s < WINDOW_MS)
        if (stamps.length < budget.perMinute) {
          stamps.push(t)
          used += 1
          return true
        }
        await sleep(stamps[0]! + WINDOW_MS - t + 5)
      }
    },
  }
}

export const UNLIMITED: CreditLimiter = { acquire: async () => true }
