import { handleMarketRequest } from '../../../server/marketData.js'

export function onRequest(context: { request: Request }): Promise<Response> {
  return handleMarketRequest(context.request)
}
