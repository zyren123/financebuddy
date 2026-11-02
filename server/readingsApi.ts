import { createCreditLimiter } from './credits.js'
import { createMarketSource, createMemoryTextStore } from './marketData.js'
import { createReadingsService, type ReadingsService } from './readings.js'
import { createMemorySnapshotStore, createTdCache } from './tdCache.js'
import { VPS_TOKEN_HEADER, type VpsRelay } from './vpsRelay.js'

export const READINGS_CACHE_CONTROL = 'public, max-age=60, s-maxage=60, stale-while-revalidate=600'

const noStore = { 'cache-control': 'no-store' }

function rejectRequest(request: Request): Response | null {
  if (request.method !== 'GET') return Response.json({ error: 'method not allowed' }, { status: 405, headers: { allow: 'GET', ...noStore } })
  if (new URL(request.url).search) return Response.json({ error: 'no parameters allowed' }, { status: 400, headers: noStore })
  return null
}

export async function handleReadingsRequest(request: Request, service: ReadingsService): Promise<Response> {
  const rejected = rejectRequest(request)
  if (rejected) return rejected
  try {
    return new Response(await service.read(), {
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': READINGS_CACHE_CONTROL },
    })
  } catch {
    return Response.json({ error: '读数暂不可用' }, { status: 503, headers: noStore })
  }
}

async function relayReadings(relay: VpsRelay): Promise<Response> {
  try {
    const response = await fetch(`${relay.baseUrl}/api/readings`, {
      headers: { [VPS_TOKEN_HEADER]: relay.token },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
    return new Response(response.body, {
      status: response.status,
      headers: {
        'content-type': response.headers.get('content-type') ?? 'application/json; charset=utf-8',
        'cache-control': response.ok ? response.headers.get('cache-control') ?? 'no-store' : 'no-store',
      },
    })
  } catch {
    return Response.json({ error: 'VPS 数据服务暂不可用，请稍后重试。' }, { status: 502, headers: noStore })
  }
}

export async function proxyReadingsRequest(
  request: Request,
  relay: VpsRelay | null,
  env: Record<string, string | undefined>,
): Promise<Response> {
  const rejected = rejectRequest(request)
  if (rejected) return rejected
  if (relay) return relayReadings(relay)
  return handleReadingsRequest(request, platformService(env.TWELVEDATA_API_KEY))
}

let platform: ReadingsService | null = null

function platformService(apiKey: string | undefined): ReadingsService {
  if (!platform) {
    const td = apiKey ? createTdCache({ store: createMemorySnapshotStore(), apiKey, credits: createCreditLimiter() }) : null
    platform = createReadingsService({
      bars: td ? td.bars : async () => null,
      market: createMarketSource({ store: createMemoryTextStore() }).load,
      publishedLayout: async () => null,
    })
  }
  return platform
}
