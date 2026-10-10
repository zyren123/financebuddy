/**
 * VPS 共享行情缓存的核心(ADR-0004):每个 symbol+interval 只存一份全量快照,
 * 所有访客的全量 / 增量请求都从快照切片,上游调用与访客数无关。
 * 只用 Web 标准 API;存储经 SnapshotStore 注入(VPS 用 Redis,测试与本地用内存)。
 */

export type Interval = '1day' | '1week' | '1month'

export interface RawBar {
  datetime: string
  [field: string]: unknown
}

export interface Snapshot {
  meta: unknown
  /** 新→旧,与上游一致 */
  values: RawBar[]
  fetchedAt: number
}

export interface SnapshotStore {
  get(key: string): Promise<Snapshot | null>
  set(key: string, snapshot: Snapshot): Promise<void>
}

export interface SeriesQuery {
  symbol: string
  interval: Interval
  outputsize: number | null
  startDate: string | null
  endDate: string | null
}

export type CacheOutcome = 'hit' | 'miss' | 'stale' | 'upstream-error'

export interface CacheResult {
  status: number
  body: string
  outcome: CacheOutcome
}

const INTERVALS = new Set<string>(['1day', '1week', '1month'])
const ALLOWED_PARAMS = new Set(['endpoint', 'symbol', 'interval', 'outputsize', 'start_date', 'end_date'])
const SYMBOL_RE = /^[A-Za-z0-9.\-:/]{1,20}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const FULL_SIZE = 5000
export const SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1000

const json = (status: number, payload: unknown, outcome: CacheOutcome) => ({
  status,
  body: JSON.stringify(payload),
  outcome,
})

export function parseSeriesQuery(params: URLSearchParams): SeriesQuery | { error: string } {
  for (const name of params.keys()) {
    if (!ALLOWED_PARAMS.has(name)) return { error: `parameter ${name} not supported` }
  }
  if (params.get('endpoint') !== 'time_series') return { error: 'endpoint not allowed' }
  const symbol = params.get('symbol') ?? ''
  const interval = params.get('interval') ?? ''
  if (!SYMBOL_RE.test(symbol)) return { error: 'invalid symbol' }
  if (!INTERVALS.has(interval)) return { error: 'invalid interval' }

  const rawSize = params.get('outputsize')
  const outputsize = rawSize === null ? null : Number(rawSize)
  if (outputsize !== null && !(Number.isInteger(outputsize) && outputsize >= 1 && outputsize <= FULL_SIZE)) {
    return { error: 'invalid outputsize' }
  }
  const startDate = params.get('start_date')
  const endDate = params.get('end_date')
  if ((startDate && !DATE_RE.test(startDate)) || (endDate && !DATE_RE.test(endDate))) {
    return { error: 'invalid date' }
  }
  return { symbol: symbol.toUpperCase(), interval: interval as Interval, outputsize, startDate, endDate }
}

/**
 * 复刻上游语义:先按日期区间过滤(start_date 含、end_date 不含,2026-10-10 实测),
 * 再保留最新的 outputsize 根。
 * 未传 outputsize 时上游默认:有日期参数取最大值,否则 30。
 */
export function sliceSnapshot(values: RawBar[], q: SeriesQuery): RawBar[] {
  const inRange = values.filter(
    (b) => (!q.startDate || b.datetime >= q.startDate) && (!q.endDate || b.datetime < q.endDate),
  )
  const size = q.outputsize ?? (q.startDate || q.endDate ? FULL_SIZE : 30)
  return inRange.slice(0, size)
}

export function createMemorySnapshotStore(): SnapshotStore {
  const map = new Map<string, Snapshot>()
  return {
    get: async (key) => map.get(key) ?? null,
    set: async (key, snapshot) => void map.set(key, snapshot),
  }
}

interface UpstreamSeries {
  meta?: unknown
  values?: RawBar[]
  status?: string
  code?: number
}

export interface TdCacheDeps {
  store: SnapshotStore
  apiKey: string
  now?: () => number
}

export function createTdCache({ store, apiKey, now = Date.now }: TdCacheDeps) {
  // 同一 key 的并发刷新合并为一次上游调用(冷启动时多个访客同时到达)
  const inflight = new Map<string, Promise<Snapshot | { status: number; body: string }>>()

  async function fetchFull(q: SeriesQuery): Promise<Snapshot | { status: number; body: string }> {
    const params = new URLSearchParams({
      symbol: q.symbol,
      interval: q.interval,
      outputsize: String(FULL_SIZE),
      apikey: apiKey,
    })
    let status: number
    let body: string
    try {
      const res = await fetch(`https://api.twelvedata.com/time_series?${params.toString()}`)
      status = res.status
      body = await res.text()
    } catch (err) {
      return { status: 502, body: JSON.stringify({ error: 'upstream fetch failed', detail: String(err) }) }
    }
    let parsed: UpstreamSeries
    try {
      parsed = JSON.parse(body) as UpstreamSeries
    } catch {
      return { status: 502, body: JSON.stringify({ error: 'upstream returned non-JSON' }) }
    }
    if (status !== 200 || parsed.status === 'error' || parsed.code !== undefined || !Array.isArray(parsed.values)) {
      return { status, body }
    }
    return { meta: parsed.meta ?? null, values: parsed.values, fetchedAt: now() }
  }

  function refresh(key: string, q: SeriesQuery) {
    let pending = inflight.get(key)
    if (!pending) {
      pending = fetchFull(q).then(async (result) => {
        if ('values' in result) await store.set(key, result)
        return result
      })
      pending.finally(() => inflight.delete(key)).catch(() => {})
      inflight.set(key, pending)
    }
    return pending
  }

  return async function handle(params: URLSearchParams): Promise<CacheResult> {
    const q = parseSeriesQuery(params)
    if ('error' in q) return json(400, { error: q.error }, 'upstream-error')

    const key = `td:time_series:${q.symbol}:${q.interval}`
    const cached = await store.get(key)
    let snapshot: Snapshot
    let outcome: CacheOutcome
    if (cached && now() - cached.fetchedAt < SNAPSHOT_TTL_MS) {
      snapshot = cached
      outcome = 'hit'
    } else {
      const fresh = await refresh(key, q)
      if ('values' in fresh) {
        snapshot = fresh
        outcome = 'miss'
      } else if (cached) {
        // 上游 429 / 故障:旧快照仍是真实数据,照常切片返回
        snapshot = cached
        outcome = 'stale'
      } else {
        return { ...fresh, outcome: 'upstream-error' }
      }
    }

    const values = sliceSnapshot(snapshot.values, q)
    if (values.length === 0) {
      // 与上游一致:区间内无数据是业务错误(HTTP 200 + code 400),客户端据此保留本地缓存
      return json(
        200,
        { code: 400, message: 'No data is available on the specified dates.', status: 'error' },
        outcome,
      )
    }
    return json(200, { meta: snapshot.meta, values, status: 'ok' }, outcome)
  }
}
