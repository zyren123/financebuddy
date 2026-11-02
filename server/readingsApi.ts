/**
 * GET /api/readings 的共享核心。VPS 进程调 handleReadingsRequest;Vercel / EdgeOne 调 proxyReadingsRequest:
 * 配了 TD_CACHE_* 就转发 VPS,否则用本进程单例 service(ADR-0004 的"删掉 TD_CACHE_* 即回退")。
 */
import { createCreditLimiter } from './credits.js'
import { createMarketSource, createMemoryTextStore } from './marketData.js'
import { createReadingsService, type ReadingsService } from './readings.js'
import { createMemorySnapshotStore, createTdCache } from './tdCache.js'
import { VPS_TOKEN_HEADER, type VpsRelay } from './vpsRelay.js'

/** s-maxage 让平台边缘直接回,不必每次转发到 VPS */
export const READINGS_CACHE_CONTROL = 'public, max-age=60, s-maxage=60, stale-while-revalidate=600'

const noStore = { 'cache-control': 'no-store' }

/** URL 固定:preload 才能命中,也没有参数可以拿来刷上游 */
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

/** 流式转发 VPS 的 /api/readings,成功时原样带回 cache-control */
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

/**
 * 无 VPS 时的退路:实例存活期间复用,内存存储,按出厂口径算(不读平台 KV 的布局)。
 * 跨实例的 credit 无法协调,退路模式接受。没有 key 时 Ratio 项 source-down,美股指标照常。
 */
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
