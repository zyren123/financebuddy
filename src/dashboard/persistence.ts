import { validateDashboardState } from './schema'
import type { DashboardState } from './types'

/**
 * 布局的出入通道(ADR-0003):
 *   - 读取链:GET /api/layout(服务端 KV 的 Published Layout)→ 404/不可达回落
 *     Factory Layout(随产物分发的 default-dashboard.json)→ 皆败返回 null。
 *   - Admin 的验证 / 发布 / 恢复上一版也经此模块与 /api/layout 通信。
 *   - Draft(Admin 的会话级草稿)存 sessionStorage。
 */

const DRAFT_KEY = 'financebuddy:draft:v1'

const jsonHeaders = { 'content-type': 'application/json' }

async function readError(res: Response): Promise<string> {
  try {
    const payload = (await res.json()) as { error?: unknown }
    if (payload && typeof payload.error === 'string') return payload.error
  } catch {
    // 非 JSON 错误体
  }
  return `HTTP ${res.status}`
}

/** 读取链:Published(KV)→ Factory(捆绑 JSON);两者皆败返回 null(调用方显示失败态) */
export async function loadPublishedLayout(): Promise<DashboardState | null> {
  try {
    const res = await fetch('/api/layout')
    if (res.ok) {
      const state = validateDashboardState(await res.json())
      if (state) return state
    }
  } catch {
    // 端点不可达:回落出厂布局
  }
  try {
    const res = await fetch('/default-dashboard.json')
    if (res.ok) return validateDashboardState(await res.json())
  } catch {
    // 出厂布局也读不到(极罕见)
  }
  return null
}

/** 向服务端验证 Admin 口令(错口令在此立刻报错,而不是等到发布) */
export async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    const res = await fetch('/api/layout', {
      method: 'POST',
      headers: { ...jsonHeaders, 'x-admin-token': token },
      body: JSON.stringify({ action: 'verify' }),
    })
    return res.ok
  } catch {
    return false
  }
}

/** 发布:Draft 写入服务端成为新的 Published Layout(服务端另行校验并保留上一版) */
export async function publishLayout(state: DashboardState, token: string): Promise<void> {
  const res = await fetch('/api/layout', {
    method: 'PUT',
    headers: { ...jsonHeaders, 'x-admin-token': token },
    body: JSON.stringify(state),
  })
  if (!res.ok) throw new Error(`发布失败:${await readError(res)}`)
}

/** 恢复上一版:服务端把 prev 复制回 Published,并在响应里直接带回恢复后的布局(Admin 专属) */
export async function restorePreviousLayout(token: string): Promise<DashboardState | null> {
  const res = await fetch('/api/layout', {
    method: 'POST',
    headers: { ...jsonHeaders, 'x-admin-token': token },
    body: JSON.stringify({ action: 'restore' }),
  })
  if (!res.ok) throw new Error(`恢复上一版失败:${await readError(res)}`)
  const payload = (await res.json()) as { layout?: unknown }
  return validateDashboardState(payload.layout)
}

// ---- Draft(会话级)----

export function saveDraft(state: DashboardState): void {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(state))
  } catch {
    // 存不了就算了(隐私模式等),刷新后草稿丢失
  }
}

export function loadDraft(): DashboardState | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    return raw ? validateDashboardState(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function clearDraft(): void {
  try {
    sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    // 同上
  }
}

export function exportDashboardFile(state: DashboardState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'financebuddy-dashboard.json'
  a.click()
  URL.revokeObjectURL(url)
}
