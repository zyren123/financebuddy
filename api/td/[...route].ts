import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * 薄代理(ADR-0001):前端只请求 /api/td/<endpoint>,本函数注入平台环境变量里的
 * TWELVEDATA_API_KEY 转发给 api.twelvedata.com,并做服务端共享缓存。
 * 开发期由 vite.config.ts 的 dev proxy 提供同构行为,本地不经此文件。
 */

// 只代理白名单端点,防止变成开放代理被人烧配额(v1 只需要 time_series)
const ALLOWED_ENDPOINTS = new Set(['/time_series'])

// 简单的进程内缓存:同 query 6 小时内直接回。
// 日线 EOD 数据一天只变一次,6h TTL 足够新鲜,同时把配额消耗压到
// 「每唯一 query 每半天最多 1 credit」。
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const cache = new Map<string, { body: string; fetchedAt: number }>()

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url ?? '/', 'https://financebuddy.local')
  const endpoint = url.pathname.replace(/^\/api\/td/, '')

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }
  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    res.status(404).json({ error: `endpoint ${endpoint} not allowed` })
    return
  }

  const apiKey = process.env.TWELVEDATA_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'TWELVEDATA_API_KEY is not configured' })
    return
  }

  const cacheKey = `${endpoint}?${url.searchParams.toString()}`
  const hit = cache.get(cacheKey)
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) {
    res.status(200).type('application/json').send(hit.body)
    return
  }

  const upstreamUrl = `https://api.twelvedata.com${endpoint}?${url.searchParams.toString()}&apikey=${apiKey}`
  let status: number
  let body: string
  try {
    const upstream = await fetch(upstreamUrl)
    status = upstream.status
    body = await upstream.text()
  } catch (err) {
    res.status(502).json({ error: 'upstream fetch failed', detail: String(err) })
    return
  }

  if (status === 200 && !isUpstreamError(body)) {
    cache.set(cacheKey, { body, fetchedAt: Date.now() })
  }

  res.status(status).type('application/json').send(body)
}
