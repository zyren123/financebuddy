import { proxyTwelveData, upstreamFromEnv } from '../../../server/tdProxy'

/**
 * 腾讯 EdgeOne Pages 边缘函数适配(核心逻辑在 server/tdProxy.ts)。
 * 签名与官方模板一致:onRequest({ request, env })(Web 标准 Request/Response);
 * 环境变量在 EdgeOne Pages 控制台配置后经 env 读取,回退 process.env 便于本地调试。
 */
interface EdgeOneContext {
  request: Request
  env?: Record<string, string | undefined>
}

export async function onRequest(context: EdgeOneContext): Promise<Response> {
  const { request, env } = context
  if (request.method !== 'GET') {
    return Response.json({ error: 'method not allowed' }, { status: 405 })
  }
  const processEnv = typeof process !== 'undefined' ? process.env : undefined
  const result = await proxyTwelveData(new URL(request.url), upstreamFromEnv({ ...processEnv, ...env }))
  return new Response(result.body, {
    status: result.status,
    headers: { 'content-type': 'application/json' },
  })
}
