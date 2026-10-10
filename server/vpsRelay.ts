/**
 * 平台函数 → VPS 的转发(ADR-0004)。配了 TD_CACHE_URL + TD_CACHE_TOKEN 时,
 * /api/td 与 /api/layout 都交给 VPS,口令走请求头,API key 与 Admin 口令只在 VPS。
 */
import type { LayoutRequest, LayoutResult } from './layoutApi'

export interface VpsRelay {
  baseUrl: string
  token: string
}

export const VPS_TOKEN_HEADER = 'x-td-cache-token'

export function vpsRelayFromEnv(env: Record<string, unknown>): VpsRelay | null {
  const { TD_CACHE_URL: baseUrl, TD_CACHE_TOKEN: token } = env
  if (typeof baseUrl !== 'string' || typeof token !== 'string' || !baseUrl || !token) return null
  return { baseUrl: baseUrl.replace(/\/+$/, ''), token }
}

export async function relayToVps(
  relay: VpsRelay,
  pathAndQuery: string,
  init: { method?: string; body?: string | null; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: string }> {
  try {
    const res = await fetch(`${relay.baseUrl}${pathAndQuery}`, {
      method: init.method ?? 'GET',
      body: init.body ?? undefined,
      headers: { ...init.headers, [VPS_TOKEN_HEADER]: relay.token },
    })
    return { status: res.status, body: await res.text() }
  } catch (err) {
    return { status: 502, body: JSON.stringify({ error: 'vps relay failed', detail: String(err) }) }
  }
}

export function relayLayoutRequest(relay: VpsRelay, req: LayoutRequest): Promise<LayoutResult> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (req.adminToken) headers['x-admin-token'] = req.adminToken
  return relayToVps(relay, '/api/layout', { method: req.method, body: req.body, headers })
}
