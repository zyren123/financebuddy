import type { VercelRequest, VercelResponse } from '@vercel/node'
import { proxyTwelveData, upstreamFromEnv } from '../server/tdProxy'

/** Vercel 适配:GET /api/td?endpoint=…(核心逻辑在 server/tdProxy.ts) */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }
  const url = new URL(req.url ?? '/', 'https://financebuddy.local')
  const result = await proxyTwelveData(url, upstreamFromEnv(process.env))
  res.setHeader('content-type', 'application/json')
  res.status(result.status).send(result.body)
}
