import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleLayoutRequest } from '../server/layoutApi'
import type { LayoutStore } from '../server/layoutApi'
import { readBody } from '../server/readBody'

/** Vercel 适配:/api/layout(GET 读 / PUT 发布 / POST verify|restore),KV 用 Upstash Redis REST(ADR-0003) */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const base = process.env.UPSTASH_REDIS_REST_URL
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!base || !restToken) {
    res.status(500).json({ error: 'UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN is not configured' })
    return
  }

  // Upstash REST:get 返回 {result: string|null},set 用 text/plain body 直写字符串
  const store: LayoutStore = {
    async get(key) {
      const r = await fetch(`${base}/get/${key}`, { headers: { Authorization: `Bearer ${restToken}` } })
      if (!r.ok) throw new Error(`upstash get ${key}: HTTP ${r.status}`)
      const payload = (await r.json()) as { result: string | null }
      return payload.result
    },
    async put(key, value) {
      const r = await fetch(`${base}/set/${key}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${restToken}`, 'content-type': 'text/plain' },
        body: value,
      })
      if (!r.ok) throw new Error(`upstash set ${key}: HTTP ${r.status}`)
    },
  }

  const headerToken = req.headers['x-admin-token']
  try {
    const result = await handleLayoutRequest(
      {
        method: req.method ?? 'GET',
        url: new URL(req.url ?? '/', 'https://financebuddy.local'),
        body: await readBody(req),
        adminToken: Array.isArray(headerToken) ? (headerToken[0] ?? null) : (headerToken ?? null),
      },
      store,
      process.env.ADMIN_TOKEN,
    )
    res.setHeader('content-type', 'application/json')
    res.status(result.status).send(result.body)
  } catch (err) {
    res.status(500).json({ error: 'layout store unavailable', detail: String(err) })
  }
}
