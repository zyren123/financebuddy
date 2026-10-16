import type { VercelRequest, VercelResponse } from '@vercel/node'
import { proxyMarketRequest } from '../server/marketProxy.js'
import { vpsRelayFromEnv } from '../server/vpsRelay.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const result = await proxyMarketRequest(new Request(new URL(req.url ?? '/', 'https://financebuddy.local'), { method: req.method ?? 'GET' }), vpsRelayFromEnv(process.env))
  result.headers.forEach((value, key) => res.setHeader(key, value))
  res.status(result.status).send(await result.text())
}
