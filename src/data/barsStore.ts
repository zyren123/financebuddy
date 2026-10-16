import { get, set } from 'idb-keyval'
import { fetchBars } from './twelveData'
import { PRICE_ADJUSTMENT } from './types'
import type { Bar, Interval } from './types'

// 单次上限 5000 根日 K(≈20 年),按共识视为"全量历史",不再分段回补更早数据
const FULL_SIZE = 5000
// 分红/拆股会重写历史复权价;每 6h 刷新同一口径的完整快照。
const RESYNC_AFTER_MS = 6 * 60 * 60 * 1000

interface CachedBars {
  bars: Bar[]
  syncedAt: number
}

const keyOf = (symbol: string, interval: Interval) => `bars:${PRICE_ADJUSTMENT}:${symbol}:${interval}`

/**
 * 取某 symbol+interval 的完整 K 线(本地 IndexedDB 优先):
 * 无缓存或超 6h → 全量替换,避免公司行动后新旧复权因子混用。
 */
export async function ensureBars(symbol: string, interval: Interval): Promise<Bar[]> {
  const key = keyOf(symbol, interval)
  const cached = await get<CachedBars>(key)

  if (cached && Date.now() - cached.syncedAt < RESYNC_AFTER_MS) {
    return cached.bars
  }

  let bars: Bar[]
  try {
    bars = await fetchBars({ symbol, interval, outputsize: FULL_SIZE })
  } catch (error) {
    if (cached?.bars.length) return cached.bars
    throw error
  }

  await set(key, { bars, syncedAt: Date.now() })
  return bars
}
