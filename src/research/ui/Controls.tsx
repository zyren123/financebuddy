import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDownIcon, CloseIcon, DiceIcon, PlayIcon, PlusIcon, SlidersIcon, StopIcon } from '../../ui/icons'
import { DEFAULT_GATE } from '../types'
import type { ExperimentConfig, GateParams, RuleSpec } from '../types'
import { GATE_AXES, GATE_AXIS_ORDER, FIXED_OPTIONS, MAX_RULES, SMA_OPTIONS, WORLD_OPTIONS, blockLabel, lagLabel, newRule, ruleDetail, ruleLabel, slotColor } from './rules'
import type { SlottedRule } from './rules'

export type WorldConfig = Omit<ExperimentConfig, 'rules'>

const btn = 'inline-flex items-center gap-1.5 border border-edge px-2.5 py-1.5 text-[12px] text-ink-muted transition-colors duration-150 hover:border-copper hover:text-ink disabled:opacity-40 disabled:hover:border-edge disabled:hover:text-ink-muted'
const btnPrimary = 'inline-flex items-center gap-1.5 bg-ink px-3 py-1.5 text-[12px] font-medium text-void transition-colors duration-150 hover:bg-ink-muted disabled:opacity-40 disabled:hover:bg-ink'

function Field({ label, children, wide }: { label: string; children: (id: string) => ReactNode; wide?: boolean }) {
  const id = useId()
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${wide ? 'col-span-2' : ''}`}>
      <label htmlFor={id} className="text-[11px] text-ink-faint">{label}</label>
      {children(id)}
    </div>
  )
}

function Select<T extends string | number>({ id, value, options, onChange, disabled, title }: {
  id: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  disabled?: boolean
  title?: string
}) {
  return (
    <span className="relative inline-flex">
      <select
        id={id}
        value={String(value)}
        disabled={disabled}
        title={title}
        onChange={(event) => {
          const picked = options.find((o) => String(o.value) === event.target.value)
          if (picked) onChange(picked.value)
        }}
        className="num w-full min-w-0 appearance-none border-b border-field bg-transparent py-1 pr-6 text-[12px] text-ink outline-none transition-colors hover:border-ink-muted focus:border-copper disabled:opacity-40"
      >
        {options.map((o) => <option key={String(o.value)} value={String(o.value)} className="bg-void-raised text-ink">{o.label}</option>)}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-ink-faint" />
    </span>
  )
}

export function ConfigStrip({ world, onWorld, status, done, total, onRun, onStop, dirty, runNumber }: {
  world: WorldConfig
  onWorld: (next: WorldConfig) => void
  status: 'idle' | 'loading' | 'running' | 'done' | 'error' | 'cancelled'
  done: number
  total: number
  onRun: () => void
  onStop: () => void
  dirty: boolean
  runNumber: string
}) {
  const busy = status === 'loading' || status === 'running'
  const progress = total > 0 ? done / total : 0
  return (
    <div className="relative border-t border-copper-dim pt-4">
      <span aria-hidden className="absolute left-0 top-[-1px] h-px origin-left bg-copper transition-transform duration-200 ease-out" style={{ width: '100%', transform: `scaleX(${busy ? progress : 0})` }} />
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <span className="num self-center pb-1 text-[12px] text-copper">{runNumber}</span>
        <div className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-end lg:gap-x-6">
          <Field label="构造方式">{(id) => <Select id={id} value={world.method} disabled={busy} title={WORLD_OPTIONS.method.find((m) => m.value === world.method)?.detail} options={WORLD_OPTIONS.method.map((m) => ({ value: m.value, label: m.label }))} onChange={(method) => onWorld({ ...world, method })} />}</Field>
          <Field label={world.method === 'permute' ? '段长' : '平均段长'}>{(id) => <Select id={id} value={world.block} disabled={busy} options={WORLD_OPTIONS.block.map((b) => ({ value: b, label: blockLabel(b) }))} onChange={(block) => onWorld({ ...world, block })} />}</Field>
          <Field label="世界数">{(id) => <Select id={id} value={world.worlds} disabled={busy} options={WORLD_OPTIONS.worlds.map((w) => ({ value: w, label: w.toLocaleString('en-US') }))} onChange={(worlds) => onWorld({ ...world, worlds })} />}</Field>
          <Field label="随机种子">{(id) => (
            <span className="flex items-center gap-1">
              <input
                id={id}
                inputMode="numeric"
                disabled={busy}
                value={world.seed}
                onChange={(event) => {
                  const seed = Number(event.target.value.replace(/\D/g, '').slice(0, 9))
                  onWorld({ ...world, seed })
                }}
                className="num w-[86px] border-b border-field bg-transparent py-1 text-[12px] text-ink outline-none transition-colors hover:border-ink-muted focus:border-copper disabled:opacity-40"
              />
              <button type="button" disabled={busy} title="换一个随机种子" aria-label="换一个随机种子" className="p-1 text-ink-muted transition-colors hover:text-ink disabled:opacity-40" onClick={() => onWorld({ ...world, seed: Math.floor(Math.random() * 1e8) })}><DiceIcon /></button>
            </span>
          )}</Field>
          <Field label="成交">{(id) => <Select id={id} value={world.executionLag} disabled={busy} options={WORLD_OPTIONS.lag.map((l) => ({ value: l, label: lagLabel(l) }))} onChange={(executionLag) => onWorld({ ...world, executionLag })} />}</Field>
          <Field label="每次切换成本">{(id) => <Select id={id} value={world.costBps} disabled={busy} options={WORLD_OPTIONS.cost.map((c) => ({ value: c, label: `${c} bp` }))} onChange={(costBps) => onWorld({ ...world, costBps })} />}</Field>
        </div>
        <div className="ml-auto flex items-center gap-3 self-end">
          {busy && <span className="num text-[11px] text-ink-muted" role="status" aria-live="polite">{status === 'loading' ? '载入行情数据…' : `${done.toLocaleString('en-US')} / ${total.toLocaleString('en-US')} 个世界`}</span>}
          {busy
            ? <button type="button" className={btn} onClick={onStop}><StopIcon /> 停止</button>
            : <button type="button" className={btnPrimary} onClick={onRun}><PlayIcon /> {status === 'idle' ? '运行' : dirty ? '运行新配置' : '复跑'}</button>}
        </div>
      </div>
      {world.block === 1 && <p className="mt-3 max-w-[70ch] text-[12px] leading-relaxed text-ink-faint">段长 1 天会打散波动聚集，三门依赖的结构随之消失，适合当对照组。</p>}
    </div>
  )
}

export function RuleChips({ rules, focus, onFocus, onChange, onRemove, onAdd, editing, onEdit, disabled }: {
  rules: SlottedRule[]
  focus: string
  onFocus: (id: string) => void
  onChange: (rule: SlottedRule) => void
  onRemove: (id: string) => void
  onAdd: (spec: RuleSpec) => void
  editing: string | null
  onEdit: (id: string | null) => void
  disabled: boolean
}) {
  const [adding, setAdding] = useState(false)
  const editingRule = rules.find((r) => r.spec.id === editing)
  return (
    <div>
      <ul className="-mx-5 flex items-center gap-2 overflow-x-auto px-5 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0" aria-label="参与回测的规则">
        {rules.map((rule) => {
          const active = rule.spec.id === focus
          return (
            <li key={rule.spec.id} className={`flex shrink-0 items-stretch border transition-colors ${active ? 'border-ink-muted' : 'border-edge hover:border-field'}`}>
              <button type="button" aria-pressed={active} title={`${ruleDetail(rule.spec)}。点按在扇面里查看`} onClick={() => onFocus(rule.spec.id)} className={`flex items-center gap-2 py-1.5 pl-2.5 pr-2 text-[12px] transition-colors ${active ? 'text-ink' : 'text-ink-muted hover:text-ink'}`}>
                <span aria-hidden className="h-[2px] w-3" style={{ background: slotColor(rule.slot) }} />
                {ruleLabel(rule.spec)}
              </button>
              {rule.spec.kind !== 'hold' && (
                <button type="button" disabled={disabled} aria-label={`调整 ${ruleLabel(rule.spec)}`} aria-expanded={editing === rule.spec.id} onClick={() => onEdit(editing === rule.spec.id ? null : rule.spec.id)} className={`px-1.5 transition-colors disabled:opacity-40 ${editing === rule.spec.id ? 'text-copper' : 'text-ink-faint hover:text-ink'}`}><SlidersIcon /></button>
              )}
              <button type="button" disabled={disabled || rules.length <= 1} aria-label={`移除 ${ruleLabel(rule.spec)}`} onClick={() => onRemove(rule.spec.id)} className="pl-1 pr-2 text-ink-faint transition-colors hover:text-down disabled:opacity-40 disabled:hover:text-ink-faint"><CloseIcon /></button>
            </li>
          )
        })}
        <li className="shrink-0">
          {adding ? (
            <span className="flex flex-wrap items-center gap-1.5">
              {([['gate', '三门'], ['sma', '均线 SMA'], ['fixed', '固定比例'], ['hold', '持有']] as const).map(([kind, label]) => (
                <button key={kind} type="button" className={btn} onClick={() => { const spec = newRule(kind); onAdd(spec); setAdding(false); if (kind !== 'hold') onEdit(spec.id) }}>{label}</button>
              ))}
              <button type="button" aria-label="取消添加" className="p-1.5 text-ink-faint transition-colors hover:text-ink" onClick={() => setAdding(false)}><CloseIcon /></button>
            </span>
          ) : (
            <button type="button" className={btn} disabled={disabled || rules.length >= MAX_RULES} title={rules.length >= MAX_RULES ? `最多 ${MAX_RULES} 条规则，每条占一个固定颜色` : undefined} onClick={() => setAdding(true)}><PlusIcon /> 添加规则</button>
          )}
        </li>
      </ul>
      {editingRule && editingRule.spec.kind !== 'hold' && (
        <RuleEditor rule={editingRule} onChange={onChange} onClose={() => onEdit(null)} />
      )}
    </div>
  )
}

function RuleEditor({ rule, onChange, onClose }: { rule: SlottedRule; onChange: (rule: SlottedRule) => void; onClose: () => void }) {
  const { spec } = rule
  const set = (next: RuleSpec) => onChange({ ...rule, spec: next })
  let fields: ReactNode = null
  if (spec.kind === 'gate') {
    const setParam = (axis: keyof GateParams, value: number) => set({ ...spec, params: { ...spec.params, [axis]: value } })
    fields = GATE_AXIS_ORDER.map((axis) => (
      <Field key={axis} label={GATE_AXES[axis].label}>{(id) => <Select id={id} value={spec.params[axis]} options={GATE_AXES[axis].options.map((v) => ({ value: v, label: `${GATE_AXES[axis].format(v)}${v === DEFAULT_GATE[axis] ? ' · 作者' : ''}` }))} onChange={(v) => setParam(axis, v)} />}</Field>
    ))
  } else if (spec.kind === 'sma') {
    fields = <>
      <Field label="信号基准">{(id) => <Select id={id} value={spec.basis} options={SMA_OPTIONS.basis} onChange={(basis) => set({ ...spec, basis })} />}</Field>
      <Field label="均线窗口">{(id) => <Select id={id} value={spec.window} options={SMA_OPTIONS.window.map((w) => ({ value: w, label: `${w} 日` }))} onChange={(window) => set({ ...spec, window })} />}</Field>
      <Field label="买入缓冲">{(id) => <Select id={id} value={spec.enter} options={SMA_OPTIONS.band.map((b) => ({ value: b, label: `+${Math.round(b * 100)}%` }))} onChange={(enter) => set({ ...spec, enter })} />}</Field>
      <Field label="卖出缓冲">{(id) => <Select id={id} value={spec.exit} options={SMA_OPTIONS.band.map((b) => ({ value: b, label: `−${Math.round(b * 100)}%` }))} onChange={(exit) => set({ ...spec, exit })} />}</Field>
    </>
  } else if (spec.kind === 'fixed') {
    fields = <>
      <Field label="TQQQ 权重">{(id) => <Select id={id} value={spec.weight} options={FIXED_OPTIONS.weight.map((w) => ({ value: w, label: `${Math.round(w * 100)}%` }))} onChange={(weight) => set({ ...spec, weight })} />}</Field>
      <Field label="再平衡带">{(id) => <Select id={id} value={spec.band} options={FIXED_OPTIONS.band.map((b) => ({ value: b, label: `${Math.round(b * 100)} 个百分点` }))} onChange={(band) => set({ ...spec, band })} />}</Field>
    </>
  }
  return (
    <div className="mt-3 border-t border-edge pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="flex items-center gap-2 text-[12px] text-ink"><span aria-hidden className="h-[2px] w-3" style={{ background: slotColor(rule.slot) }} />{ruleLabel(spec)}</span>
        <span className="flex gap-2">
          {spec.kind === 'gate' && <button type="button" className={btn} onClick={() => set({ ...spec, params: { ...DEFAULT_GATE } })}>恢复作者参数</button>}
          <button type="button" className={btn} onClick={onClose}>完成</button>
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 lg:grid-cols-7">{fields}</div>
      <p className="mt-3 text-[12px] leading-relaxed text-ink-faint">{ruleDetail(spec)}。</p>
    </div>
  )
}
