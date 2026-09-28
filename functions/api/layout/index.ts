import { handleLayoutRequest } from '../../../server/layoutApi'
import type { LayoutStore } from '../../../server/layoutApi'

/**
 * 腾讯 EdgeOne Pages 边缘函数适配(核心逻辑在 server/layoutApi.ts)。
 * KV:控制台创建 KV 命名空间后,在函数设置里把绑定名设为 LAYOUT_KV(经 env 或全局注入)。
 * 环境变量在 EdgeOne Pages 控制台配置后经 env 读取,回退 process.env 便于本地调试。
 */
interface EdgeOneContext {
  request: Request
  env?: Record<string, unknown>
}

export async function onRequest(context: EdgeOneContext): Promise<Response> {
  const { request, env } = context
  const kv = (env?.LAYOUT_KV as LayoutStore | undefined) ?? (globalThis as { LAYOUT_KV?: LayoutStore }).LAYOUT_KV
  const adminToken =
    (typeof env?.ADMIN_TOKEN === 'string' ? env.ADMIN_TOKEN : undefined) ??
    (typeof process !== 'undefined' ? process.env?.ADMIN_TOKEN : undefined)
  if (!kv) {
    return Response.json({ error: 'LAYOUT_KV binding is not configured' }, { status: 500 })
  }

  const body = request.method === 'GET' || request.method === 'HEAD' ? null : await request.text()
  try {
    const result = await handleLayoutRequest(
      {
        method: request.method,
        url: new URL(request.url),
        body,
        adminToken: request.headers.get('x-admin-token'),
      },
      kv,
      adminToken,
    )
    return new Response(result.body, { status: result.status, headers: { 'content-type': 'application/json' } })
  } catch (err) {
    return Response.json({ error: 'layout store unavailable', detail: String(err) }, { status: 500 })
  }
}
