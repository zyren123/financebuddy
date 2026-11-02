import { validateDashboardState } from '../src/dashboard/schema.js'
import type { Bar } from '../src/data/types.js'
import { basisOf, symbolsOf } from '../src/readings/basis.js'
import { buildSnapshot } from '../src/readings/compute.js'
import type { MarketInputs } from '../src/readings/compute.js'
import type { Item, ReadingsSnapshot } from '../src/readings/model.js'
import { MARKET_TTL_MS } from './marketData.js'

export interface ReadingsDeps {
  bars(symbol: string): Promise<Bar[] | null>
  market(): Promise<MarketInputs>
  publishedLayout(): Promise<string | null>
  now?: () => number
}

export const READINGS_REFRESH_MS = Math.min(...Object.values(MARKET_TTL_MS))

export interface ReadingsService {
  /**
   * 序列化好的快照 JSON。有快照立刻回;超过 READINGS_REFRESH_MS 同时在后台重算。
   * 无快照则等这一次计算;从未算成功 → 抛。
   */
  read(): Promise<string>
  /** 保证返回前完成一次在调用之后开始的计算 */
  refresh(): Promise<void>
  /** 立即算一次,之后每 READINGS_REFRESH_MS 一次;返回停止函数 */
  start(): () => void
}

function parseLayout(raw: string | null) {
  if (!raw) return null
  try {
    return validateDashboardState(JSON.parse(raw))
  } catch {
    return null
  }
}

function unavailableOf(snapshot: ReadingsSnapshot): string[] {
  const { indices, vix, fearGreed } = snapshot.market
  const items: Array<[string, Item]> = [
    ...snapshot.ratios.map((r): [string, Item] => [`${r.pair.numerator}/${r.pair.denominator}`, r.roc]),
    ...(['sp500', 'nasdaq100'] as const).flatMap((index) =>
      (['rsi', 'drawdown', 'pe', 'percentile'] as const).map((k): [string, Item] => [`${index}.${k}`, indices[index][k]]),
    ),
    ['vix', vix],
    ['fearGreed', fearGreed],
  ]
  return items.filter(([, item]) => item.status === 'unavailable').map(([name]) => name)
}

export function createReadingsService({ bars, market, publishedLayout, now = Date.now }: ReadingsDeps): ReadingsService {
  let current: { json: string; computedAt: number } | null = null
  let running: Promise<void> | null = null
  let rerun: Promise<void> | null = null

  async function compute(): Promise<void> {
    const started = now()
    const state = parseLayout(await publishedLayout())
    const basis = basisOf(state)
    const symbols = symbolsOf(state, basis)
    const [series, inputs] = await Promise.all([
      Promise.all(symbols.map((symbol) => bars(symbol).catch((err: unknown) => {
        console.error('readings bars failed', symbol, err)
        return null
      }))),
      market(),
    ])
    const bySymbol = new Map(symbols.flatMap((symbol, i) => (series[i] ? [[symbol, series[i]] as const] : [])))
    const snapshot = buildSnapshot(bySymbol, inputs, basis, now())
    current = { json: JSON.stringify(snapshot), computedAt: snapshot.computedAt }
    console.log(JSON.stringify({ readings: now() - started, unavailable: unavailableOf(snapshot) }))
  }

  function join(): Promise<void> {
    if (!running) {
      running = compute().finally(() => {
        running = null
      })
    }
    return running
  }

  function refresh(): Promise<void> {
    if (!running) return join()
    if (!rerun) {
      rerun = running.catch(() => {}).then(() => {
        rerun = null
        return join()
      })
    }
    return rerun
  }

  return {
    async read() {
      if (!current) await join()
      if (!current) throw new Error('readings unavailable')
      if (now() - current.computedAt >= READINGS_REFRESH_MS) {
        join().catch((err: unknown) => console.error('readings revalidate failed', err))
      }
      return current.json
    },
    refresh,
    start() {
      let timer: ReturnType<typeof setTimeout> | undefined
      let stopped = false
      const tick = () => {
        refresh()
          .catch((err: unknown) => console.error('readings refresh failed', err))
          .finally(() => {
            if (!stopped) timer = setTimeout(tick, READINGS_REFRESH_MS)
          })
      }
      tick()
      return () => {
        stopped = true
        clearTimeout(timer)
      }
    },
  }
}
