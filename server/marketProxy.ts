import { handleMarketRequest, marketFeedFromRequest } from './marketData.js'
import { VPS_TOKEN_HEADER, type VpsRelay } from './vpsRelay.js'

/** The VPS calls handleMarketRequest directly, so forwarding never loops. */
export async function proxyMarketRequest(request: Request, relay: VpsRelay | null): Promise<Response> {
  const feed = marketFeedFromRequest(request)
  if (feed instanceof Response) return feed
  if (!relay) return handleMarketRequest(request)

  try {
    const response = await fetch(`${relay.baseUrl}/api/market?feed=${feed}`, {
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
    return Response.json({ error: 'VPS 数据服务暂不可用，请稍后重试。' }, { status: 502, headers: { 'cache-control': 'no-store' } })
  }
}
