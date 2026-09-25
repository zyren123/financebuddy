import { get, set } from 'idb-keyval'
import { addDays, todayISO } from '../lib/date'
import { fetchBars } from './twelveData'
import type { Bar, Interval } from './types'

// 单次上限 5000 根日 K(≈20 年),按共识视为"全量历史",不再分段回补更早数据
const FULL_SIZE = 5000
// 距上次同步超过 6h 才做增量(与服务端代理缓存 TTL 对齐:每 symbol 每天最多 ~4 credits)
const RESYNC_AFTER_MS = 6 * 60 * 60 * 1000

interface CachedBars {
  bars: Bar[]
  syncedAt: number
}

const keyOf = (symbol: string, interval: Interval) => `bars:${symbol}:${interval}`

/** 纯函数:合并两段 K 线,同日以新数据覆盖(盘中部分 K / 收盘修正),结果升序 */
export function mergeBars(older: Bar[], newer: Bar[]): Bar[] {
  const byDate = new Map(older.map((b) => [b.datetime, b]))
  for (const b of newer) byDate.set(b.datetime, b)
  return [...byDate.values()].sort((a, b) => (a.datetime < b.datetime ? -1 : 1))
}

/**
 * 取某 symbol+interval 的完整 K 线(本地 IndexedDB 优先):
 * 无缓存 → 全量拉取;有缓存且超 6h → 从最后一根次日起增量补。
 */
export async function ensureBars(symbol: string, interval: Interval): Promise<Bar[]> {
  const key = keyOf(symbol, interval)
  const cached = await get<CachedBars>(key)

  if (cached && Date.now() - cached.syncedAt < RESYNC_AFTER_MS) {
    return cached.bars
  }

  let bars: Bar[]
  if (!cached || cached.bars.length === 0) {
    bars = await fetchBars({ symbol, interval, outputsize: FULL_SIZE })
  } else {
    const lastDate = cached.bars[cached.bars.length - 1]!.datetime
    const fresh = await fetchBars({
      symbol,
      interval,
      outputsize: 30, // 覆盖节假日缺口的缓冲
      startDate: addDays(lastDate, 1),
      endDate: todayISO(),
    })
    bars = mergeBars(cached.bars, fresh)
  }

  await set(key, { bars, syncedAt: Date.now() })
  return bars
}
