import { readEdgeEnv } from '../../../server/edgeEnv.js'
import { proxyReadingsRequest } from '../../../server/readingsApi.js'
import { vpsRelayFromEnv } from '../../../server/vpsRelay.js'

export function onRequest(context: { request: Request; env?: Record<string, string | undefined> }): Promise<Response> {
  const vars = readEdgeEnv(context.env, ['TD_CACHE_URL', 'TD_CACHE_TOKEN', 'TWELVEDATA_API_KEY'])
  return proxyReadingsRequest(context.request, vpsRelayFromEnv(vars), vars)
}
