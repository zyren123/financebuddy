/**
 * Twelve Data 薄代理的共享核心(ADR-0001),被两端适配:
 *   - api/td.ts                  → Vercel serverless(/api/td)
 *   - functions/api/td/index.ts  → 腾讯 EdgeOne Pages 边缘函数(/api/td)
 *
 * 约定端点:GET /api/td?endpoint=time_series&<上游参数>
 * 只用 Web 标准 API(URL/fetch),不含任何平台类型。
 */

// 只代理白名单端点,防止变成开放代理被人烧配额(v1 只需要 time_series)
const ALLOWED_ENDPOINTS = new Set(['/time_series'])

// 进程内共享缓存:同 query 6 小时内直接回。
// 日线 EOD 一天只变一次,6h TTL 足够新鲜,同时把配额消耗压到
// 「每唯一 query 每半天最多 1 credit」。(边缘实例会被回收,缓存尽力而为)
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const cache = new Map<string, { body: string; fetchedAt: number }>()

export interface ProxyResult {
  status: number
  body: string
}

interface TwelveDataError {
  code?: number
  status?: string
}

function isUpstreamError(body: string): boolean {
  try {
    const parsed = JSON.parse(body) as TwelveDataError
    return parsed.code !== undefined || parsed.status === 'error'
  } catch {
    return true
  }
}

const json = (status: number, payload: unknown): ProxyResult => ({
  status,
  body: JSON.stringify(payload),
})

/**
 * @param url 客户端请求的完整 URL(path 固定为 /api/td,端点与参数都在 query 里)
 * @param apiKey 平台环境变量里的 Twelve Data key
 */
export async function proxyTwelveData(url: URL, apiKey: string | undefined): Promise<ProxyResult> {
  if (url.pathname.replace(/\/+$/, '') !== '/api/td') {
    return json(404, { error: 'not found' })
  }

  const endpoint = `/${url.searchParams.get('endpoint') ?? ''}`
  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    return json(404, { error: `endpoint ${endpoint} not allowed` })
  }
  if (!apiKey) {
    return json(500, { error: 'TWELVEDATA_API_KEY is not configured' })
  }

  const params = new URLSearchParams(url.searchParams)
  params.delete('endpoint')
  const cacheKey = `${endpoint}?${params.toString()}`

  const hit = cache.get(cacheKey)
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) {
    return { status: 200, body: hit.body }
  }

  const upstreamUrl = `https://api.twelvedata.com${endpoint}?${params.toString()}&apikey=${apiKey}`
  let status: number
  let body: string
  try {
    const upstream = await fetch(upstreamUrl)
    status = upstream.status
    body = await upstream.text()
  } catch (err) {
    return json(502, { error: 'upstream fetch failed', detail: String(err) })
  }

  if (status === 200 && !isUpstreamError(body)) {
    cache.set(cacheKey, { body, fetchedAt: Date.now() })
  }
  return { status, body }
}
