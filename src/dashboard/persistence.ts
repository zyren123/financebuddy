import type { Layout } from 'react-grid-layout'
import type { CardConfig, DashboardState, IndicatorKind } from './types'

// Local Layout:localStorage;Published Layout:随产物分发的 default-dashboard.json(见 ADR/CONTEXT 术语)

const STORAGE_KEY = 'financebuddy:dashboard:v1'

const RANGES = new Set(['6m', '1y', '3y', '5y', 'max'])
const INDICATORS = new Set<IndicatorKind>(['rsi', 'roc', 'sma', 'ema'])

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function parseCard(v: unknown): CardConfig | null {
  if (!isRecord(v) || typeof v.id !== 'string' || typeof v.range !== 'string' || !RANGES.has(v.range)) {
    return null
  }
  const range = v.range as CardConfig['range']
  if (v.kind === 'candle' && typeof v.symbol === 'string' && v.symbol) {
    return { id: v.id, range, kind: 'candle', symbol: v.symbol.toUpperCase() }
  }
  if (v.kind === 'ratioRoc' && typeof v.rocPeriod === 'number' && Array.isArray(v.pairs)) {
    const pairs = v.pairs
      .filter(
        (p): p is { numerator: string; denominator: string } =>
          isRecord(p) && typeof p.numerator === 'string' && typeof p.denominator === 'string' && p.numerator !== '' && p.denominator !== '',
      )
      .map((p) => ({ numerator: p.numerator.toUpperCase(), denominator: p.denominator.toUpperCase() }))
    if (pairs.length === 0) return null
    return { id: v.id, range, kind: 'ratioRoc', rocPeriod: Math.max(1, Math.round(v.rocPeriod)), pairs }
  }
  if (
    v.kind === 'indicator' &&
    typeof v.symbol === 'string' &&
    v.symbol &&
    typeof v.indicator === 'string' &&
    INDICATORS.has(v.indicator as IndicatorKind) &&
    typeof v.period === 'number'
  ) {
    return {
      id: v.id,
      range,
      kind: 'indicator',
      symbol: v.symbol.toUpperCase(),
      indicator: v.indicator as IndicatorKind,
      period: Math.max(1, Math.round(v.period)),
    }
  }
  return null
}

function parseLayout(v: unknown): Layout | null {
  if (!Array.isArray(v)) return null
  const items = v.filter(
    (item): item is { i: string; x: number; y: number; w: number; h: number } =>
      isRecord(item) &&
      typeof item.i === 'string' &&
      [item.x, item.y, item.w, item.h].every((n) => typeof n === 'number'),
  )
  return items.map((item) => ({ ...item, minW: 3, minH: 4 }))
}

/** 严格校验并规整外来 JSON(localStorage / 导入文件 / 发布布局),坏数据返回 null */
export function validateDashboardState(v: unknown): DashboardState | null {
  if (!isRecord(v) || v.version !== 1 || !Array.isArray(v.cards)) return null
  const cards = v.cards.map(parseCard).filter((c): c is CardConfig => c !== null)
  if (cards.length === 0) return null
  const layout = parseLayout(v.layout) ?? []
  return { version: 1, cards, layout }
}

export function loadLocalDashboard(): DashboardState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? validateDashboardState(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function saveLocalDashboard(state: DashboardState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

/** Published Layout:随应用分发的默认布局(仓库 public/default-dashboard.json) */
export async function loadPublishedDashboard(): Promise<DashboardState> {
  const res = await fetch('/default-dashboard.json')
  if (!res.ok) throw new Error(`读取默认布局失败:HTTP ${res.status}`)
  const state = validateDashboardState(await res.json())
  if (!state) throw new Error('默认布局文件格式无效')
  return state
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
