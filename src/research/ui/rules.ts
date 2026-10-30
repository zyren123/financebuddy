import { CHART_COLORS } from '../../charts/theme'
import { DEFAULT_GATE } from '../types'
import type { ExperimentConfig, GateParams, RuleSpec, SignalBasis } from '../types'

export const MAX_RULES = CHART_COLORS.series.length

/** 实验台里的一条规则:颜色槽跟着规则走,删掉别的规则不会让它换色(Fixed-Slot Rule) */
export interface SlottedRule {
  spec: RuleSpec
  slot: number
}

export const GATE_AXES = {
  volLimit: { label: '波动上限', options: [0.25, 0.3, 0.35, 0.4, 0.45], format: (v: number) => `${Math.round(v * 100)}%` },
  shockLimit: { label: '冲击上限', options: [1, 1.05, 1.1, 1.2, 1.3], format: (v: number) => v.toFixed(2) },
  exitDrawdown: { label: '回撤退出线', options: [-0.15, -0.2, -0.25, -0.3], format: (v: number) => `−${Math.round(-v * 100)}%` },
  reenterDrawdown: { label: '回撤重入线', options: [-0.05, -0.1, -0.15], format: (v: number) => `−${Math.round(-v * 100)}%` },
  shortWindow: { label: '短波动窗口', options: [10, 20, 40], format: (v: number) => `${v} 日` },
  longWindow: { label: '长窗口', options: [150, 200, 250], format: (v: number) => `${v} 日` },
  confirmationDays: { label: '确认天数', options: [1, 2, 3, 5], format: (v: number) => `${v} 天` },
} satisfies Record<keyof GateParams, { label: string; options: number[]; format: (v: number) => string }>

export const GATE_AXIS_ORDER = Object.keys(GATE_AXES) as (keyof GateParams)[]

export const SMA_OPTIONS = {
  basis: [
    { value: 'qqq', label: 'QQQ' },
    { value: 'spy', label: 'SPY' },
    { value: 'ndx', label: 'NDX 价格' },
  ] satisfies { value: SignalBasis; label: string }[],
  window: [100, 150, 200, 250],
  band: [0, 0.01, 0.02, 0.03, 0.04, 0.05],
}

export const FIXED_OPTIONS = { weight: [0.25, 0.5, 0.75], band: [0.05, 0.1, 0.2] }

export const WORLD_OPTIONS = {
  method: [
    { value: 'stationary', label: '有放回', detail: '平稳自助：随机起点、几何分布段长，某些时期可能多抽或少抽' },
    { value: 'permute', label: '重排', detail: '切成等长段后打乱顺序，每个交易日恰好用一次' },
  ] satisfies { value: ExperimentConfig['method']; label: string; detail: string }[],
  block: [1, 21, 63, 125, 250, 500],
  worlds: [100, 250, 500, 1000, 2000],
  lag: [0, 1, 2] as const,
  cost: [0, 2.5, 5, 10],
}

export function blockLabel(block: number): string {
  return ({ 1: '1 天', 21: '1 个月', 63: '1 个季度', 125: '半年', 250: '1 年', 500: '2 年' } as Record<number, string>)[block] ?? `${block} 日`
}

export function lagLabel(lag: number): string {
  return lag === 0 ? '信号当日收盘' : lag === 1 ? '次日收盘' : `${lag} 日后收盘`
}

function bandPct(v: number): string {
  return `${Math.round(v * 100)}`
}

function gateDiff(params: GateParams): string[] {
  return GATE_AXIS_ORDER.filter((axis) => params[axis] !== DEFAULT_GATE[axis]).map((axis) => `${GATE_AXES[axis].label} ${GATE_AXES[axis].format(params[axis])}`)
}

export function ruleLabel(spec: RuleSpec): string {
  switch (spec.kind) {
    case 'gate': {
      const diff = gateDiff(spec.params)
      return diff.length ? `三门 · ${diff.join('、')}` : '三门 · 作者参数'
    }
    case 'sma': {
      const basis = SMA_OPTIONS.basis.find((b) => b.value === spec.basis)?.label ?? spec.basis
      return `SMA${spec.window} +${bandPct(spec.enter)}/−${bandPct(spec.exit)} · ${basis}`
    }
    case 'fixed':
      return `固定 ${Math.round(spec.weight * 100)}% TQQQ`
    case 'hold':
      return spec.asset === 'tqqq' ? '持有 TQQQ' : '持有 QQQ'
    default: {
      const exhaustive: never = spec
      return exhaustive
    }
  }
}

export function ruleDetail(spec: RuleSpec): string {
  switch (spec.kind) {
    case 'gate':
      return `${spec.params.shortWindow}/${spec.params.longWindow} 日波动 · 上限 ${GATE_AXES.volLimit.format(spec.params.volLimit)} · 冲击 ${spec.params.shockLimit.toFixed(2)} · 回撤 ${GATE_AXES.exitDrawdown.format(spec.params.exitDrawdown)} 退 / ${GATE_AXES.reenterDrawdown.format(spec.params.reenterDrawdown)} 进 · 确认 ${spec.params.confirmationDays} 天`
    case 'sma':
      return `${spec.basis === 'ndx' ? 'NDX 价格' : spec.basis === 'qqq' ? 'QQQ 总收益' : 'SPY 总收益'}高于 ${spec.window} 日均线 ${bandPct(spec.enter)}% 买入，低于 ${bandPct(spec.exit)}% 卖出，交易 TQQQ`
    case 'fixed':
      return `漂移超过 ${Math.round(spec.band * 100)} 个百分点时再平衡，其余放 T-bill`
    case 'hold':
      return spec.asset === 'tqqq' ? '一直持有 TQQQ，不择时' : '一直持有 1 倍 QQQ（上市前为 NDX）'
    default: {
      const exhaustive: never = spec
      return exhaustive
    }
  }
}

/** 页面级颜色:同一条规则在每张图里同色 */
const ARCHIVE_SLOTS: Record<string, number> = {
  three_gate: 0,
  three_gate_default: 0,
  'sma200_+4/-3_qqq': 1,
  'sma200_+4/-3_spy': 2,
  ndx_sma200_4pct: 3,
  tqqq_hold: 4,
  qqq_hold: 5,
}

export function archiveSlot(ruleId: string): number {
  return ARCHIVE_SLOTS[ruleId] ?? 3
}

export function slotColor(slot: number): string {
  return CHART_COLORS.series[slot]
}

let counter = 0
export function ruleId(): string {
  counter += 1
  return `r${counter}`
}

export function defaultRules(): SlottedRule[] {
  return [
    { slot: 0, spec: { kind: 'gate', id: ruleId(), params: { ...DEFAULT_GATE } } },
    { slot: 1, spec: { kind: 'sma', id: ruleId(), basis: 'qqq', window: 200, enter: 0.04, exit: 0.03 } },
    { slot: 2, spec: { kind: 'sma', id: ruleId(), basis: 'spy', window: 200, enter: 0.04, exit: 0.03 } },
    { slot: 3, spec: { kind: 'gate', id: ruleId(), params: { ...DEFAULT_GATE, confirmationDays: 1 } } },
    { slot: 4, spec: { kind: 'hold', id: ruleId(), asset: 'tqqq' } },
    { slot: 5, spec: { kind: 'hold', id: ruleId(), asset: 'qqq' } },
  ]
}

export function newRule(kind: RuleSpec['kind']): RuleSpec {
  switch (kind) {
    case 'gate':
      return { kind, id: ruleId(), params: { ...DEFAULT_GATE } }
    case 'sma':
      return { kind, id: ruleId(), basis: 'spy', window: 200, enter: 0.04, exit: 0.03 }
    case 'fixed':
      return { kind, id: ruleId(), weight: 0.5, band: 0.1 }
    case 'hold':
      return { kind, id: ruleId(), asset: 'qqq' }
    default: {
      const exhaustive: never = kind
      return exhaustive
    }
  }
}

export function freeSlot(rules: SlottedRule[]): number | null {
  for (let slot = 0; slot < MAX_RULES; slot++) if (!rules.some((r) => r.slot === slot)) return slot
  return null
}

export const DEFAULT_WORLD = { method: 'stationary', block: 250, worlds: 500, seed: 20261030, executionLag: 1, costBps: 2.5 } satisfies Omit<ExperimentConfig, 'rules'>
