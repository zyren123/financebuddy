import { readEdgeEnv } from '../../../server/edgeEnv.js'
import { proxyMarketRequest } from '../../../server/marketProxy.js'
import { vpsRelayFromEnv } from '../../../server/vpsRelay.js'

export function onRequest(context: { request: Request; env?: Record<string, string | undefined> }): Promise<Response> {
  const vars = readEdgeEnv(context.env, ['TD_CACHE_URL', 'TD_CACHE_TOKEN'])
  return proxyMarketRequest(context.request, vpsRelayFromEnv(vars))
}
