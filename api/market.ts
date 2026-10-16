import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleMarketRequest } from '../server/marketData.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const result = await handleMarketRequest(new Request(new URL(req.url ?? '/', 'https://financebuddy.local'), { method: req.method ?? 'GET' }))
  result.headers.forEach((value, key) => res.setHeader(key, value))
  res.status(result.status).send(await result.text())
}
