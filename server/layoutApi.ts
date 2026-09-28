/**
 * 布局读写端点的共享核心(ADR-0003),被三端适配:
 *   - api/layout.ts                 → Vercel serverless(/api/layout,Upstash Redis REST)
 *   - functions/api/layout/index.ts → 腾讯 EdgeOne Pages 边缘函数(/api/layout,KV 绑定)
 *   - vite.config.ts 中间件         → 开发期同构运行(server/devLayoutStore.ts)
 *
 *   GET  /api/layout                  → 200 布局 JSON | 404 未发布(客户端回落 Factory Layout)
 *   PUT  /api/layout  (x-admin-token) → 发布:校验通过后写 published,旧版挪到 prev
 *   POST /api/layout  (x-admin-token) → {"action":"verify"} 验口令 | {"action":"restore"} 恢复上一版
 *
 * 只用 Web 标准 API 与字符串,不含平台类型;存储经 LayoutStore 注入(两个 adapter 即真 seam)。
 */
import { validateDashboardState } from '../src/dashboard/schema'

export const PUBLISHED_KEY = 'layout:published'
export const PREV_KEY = 'layout:published:prev'

/** 平台 KV 的最小 interface(get/put 一个字符串 key) */
export interface LayoutStore {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
}

export interface LayoutResult {
  status: number
  body: string
}

/** 各 adapter 从平台请求里抽出这四样,核心不接触平台类型 */
export interface LayoutRequest {
  method: string
  url: URL
  body: string | null
  adminToken: string | null
}

const json = (status: number, payload: unknown): LayoutResult => ({
  status,
  body: JSON.stringify(payload),
})

/** 定长时间比较,避免逐字节短路造成的时序侧信道 */
function tokenMatches(received: string, expected: string): boolean {
  if (received.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < received.length; i++) diff |= received.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

/** 未配置 ADMIN_TOKEN 时一律 401/500 由这里统一决定;返回 null 表示通过 */
function checkAdmin(req: LayoutRequest, adminToken: string | undefined): LayoutResult | null {
  if (!adminToken) return json(500, { error: 'ADMIN_TOKEN is not configured' })
  if (!req.adminToken || !tokenMatches(req.adminToken, adminToken)) {
    return json(401, { error: 'unauthorized' })
  }
  return null
}

function parseBody(raw: string | null): unknown | null {
  if (raw == null) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

export async function handleLayoutRequest(
  req: LayoutRequest,
  store: LayoutStore,
  adminToken: string | undefined,
): Promise<LayoutResult> {
  if (req.url.pathname.replace(/\/+$/, '') !== '/api/layout') {
    return json(404, { error: 'not found' })
  }

  if (req.method === 'GET') {
    const published = await store.get(PUBLISHED_KEY)
    if (published == null) return json(404, { error: 'not published' })
    return { status: 200, body: published }
  }

  if (req.method === 'PUT') {
    const denied = checkAdmin(req, adminToken)
    if (denied) return denied
    const parsed = parseBody(req.body)
    const state = parsed == null ? null : validateDashboardState(parsed)
    if (!state) return json(400, { error: 'invalid layout' })
    const previous = await store.get(PUBLISHED_KEY)
    if (previous != null) await store.put(PREV_KEY, previous)
    await store.put(PUBLISHED_KEY, JSON.stringify(state))
    return json(200, { ok: true })
  }

  if (req.method === 'POST') {
    const denied = checkAdmin(req, adminToken)
    if (denied) return denied
    const action = parseBody(req.body)
    if (!action || typeof action !== 'object' || typeof (action as { action?: unknown }).action !== 'string') {
      return json(400, { error: 'invalid action' })
    }
    const kind = (action as { action: string }).action
    if (kind === 'verify') {
      // 口令已在 checkAdmin 验过
      return json(200, { ok: true })
    }
    if (kind === 'restore') {
      const prev = await store.get(PREV_KEY)
      if (prev == null) return json(404, { error: 'no previous layout' })
      const restored = validateDashboardState(parseBody(prev))
      if (!restored) return json(500, { error: 'corrupt previous layout' })
      const current = await store.get(PUBLISHED_KEY)
      if (current != null) await store.put(PREV_KEY, current)
      await store.put(PUBLISHED_KEY, JSON.stringify(restored))
      // 响应直接带回恢复后的布局:EdgeOne KV 最终一致性(~60s)下,客户端立即回读可能拿到旧值
      return json(200, { ok: true, layout: restored })
    }
    return json(400, { error: 'unknown action' })
  }

  return json(405, { error: 'method not allowed' })
}
