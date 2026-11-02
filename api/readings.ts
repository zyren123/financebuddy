import type { VercelRequest, VercelResponse } from '@vercel/node'
import { proxyReadingsRequest } from '../server/readingsApi.js'
import { vpsRelayFromEnv } from '../server/vpsRelay.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const request = new Request(new URL(req.url ?? '/', 'https://financebuddy.local'), { method: req.method ?? 'GET' })
  const result = await proxyReadingsRequest(request, vpsRelayFromEnv(process.env), process.env)
  result.headers.forEach((value, key) => res.setHeader(key, value))
  res.status(result.status).send(await result.text())
}
