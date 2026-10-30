/**
 * Twelve Data credit 的唯一闸门,放在 tdCache 花 credit 的地方:后台刷新与访客未命中排同一个队,
 * symbol 再多也突破不了每分钟上限。计数只在进程内,重启清零;兜底是上游 429 + tdCache 的失败冷却。
 */
export interface CreditLimiter {
  /** 等到本分钟有余量后扣 1 个;当天(UTC)额度用完返回 false,不等到明天 */
  acquire(): Promise<boolean>
}

export interface CreditBudget {
  perMinute: number
  perDay: number
}

/** 免费档是 8/分钟、800/天;每天留 50 给人工排查等场外调用 */
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

/** 测试与不需要限速的调用方显式传它,limiter 不做成可选参数 */
export const UNLIMITED: CreditLimiter = { acquire: async () => true }
