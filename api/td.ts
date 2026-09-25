import type { VercelRequest, VercelResponse } from '@vercel/node'
import { proxyTwelveData } from '../server/tdProxy'

/** Vercel 适配:GET /api/td?endpoint=…(核心逻辑在 server/tdProxy.ts) */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }
  const url = new URL(req.url ?? '/', 'https://financebuddy.local')
  const result = await proxyTwelveData(url, process.env.TWELVEDATA_API_KEY)
  res.status(result.status).type('application/json').send(result.body)
}
