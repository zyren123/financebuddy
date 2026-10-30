import { useEffect, useMemo, useRef, useState } from 'react'
import { SelectionIndicator } from '../../motion/SelectionIndicator'
import type { Archive, RuleSpec, RuleSummary } from '../types'
import { ConfigStrip, RuleChips } from './Controls'
import type { WorldConfig } from './Controls'
import { FanChart } from './FanChart'
import { pct, seconds, share } from './format'
import { LiveNumber } from './LiveNumber'
import { PairedMatrix } from './PairedMatrix'
import { freeSlot, ruleLabel, slotColor } from './rules'
import type { SlottedRule } from './rules'
import { StripChart } from './StripChart'
import type { StripMetric } from './StripChart'
import { Term } from './Term'
import { useLiveRun } from './useLiveRun'

/** 去掉 id 后比较规则内容,用来在 Python 归档里找到同一条规则 */
export function sameRule(a: RuleSpec, b: RuleSpec): boolean {
  const canonical = (value: unknown): unknown =>
    value !== null && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'id').sort(([x], [y]) => x.localeCompare(y)).map(([key, v]) => [key, canonical(v)]))
      : value
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
}

const METRICS: { key: StripMetric; label: string }[] = [
  { key: 'maxDrawdown', label: '最大回撤' },
  { key: 'cagr', label: '年化' },
  { key: 'sharpe', label: 'Sharpe' },
]

function Readout({ label, value, format, note }: { label: string; value: number | null; format: (v: number) => string; note?: string }) {
  return (
    <div className="border-t border-edge pt-3">
      <div className="text-[11px] text-ink-faint">{label}</div>
      <LiveNumber value={value} format={format} className="num mt-1.5 block text-[clamp(1.5rem,4vw,2.25rem)] font-medium leading-none text-ink" />
      {note && <div className="num mt-1.5 text-[11px] text-ink-faint">{note}</div>}
    </div>
  )
}

export function LiveRun({ runNumber, initialWorld, initialRules, autorun, archive }: {
  runNumber: string
  initialWorld: WorldConfig
  initialRules: SlottedRule[]
  autorun?: boolean
  archive: Archive
}) {
  const { view, start, stop } = useLiveRun()
  const [world, setWorld] = useState(initialWorld)
  const [rules, setRules] = useState(initialRules)
  const [focus, setFocus] = useState(initialRules[0].spec.id)
  const [editing, setEditing] = useState<string | null>(null)
  const [metric, setMetric] = useState<StripMetric>('maxDrawdown')
  const root = useRef<HTMLDivElement>(null)
  const metricRef = useRef<HTMLDivElement>(null)

  const run = () => {
    setEditing(null)
    void start({ ...world, rules: rules.map((r) => r.spec) }, Object.fromEntries(rules.map((r) => [r.spec.id, r.slot])))
  }
  const runRef = useRef(run)
  runRef.current = run

  // 只在首次进入视口时自动运行一次
  useEffect(() => {
    if (!autorun || !root.current) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { observer.disconnect(); runRef.current() }
    }, { rootMargin: '0px 0px -20% 0px' })
    observer.observe(root.current)
    return () => observer.disconnect()
  }, [autorun])

  const busy = view.status === 'loading' || view.status === 'running'
  const ran = view.config
  const dirty = ran !== null && JSON.stringify({ ...world, rules: rules.map((r) => r.spec) }) !== JSON.stringify(ran)
  const ranRules = useMemo(() => (ran?.rules ?? []).map((spec) => ({ spec, slot: view.slots[spec.id] ?? 0 })), [ran, view.slots])
  const focusRule = ranRules.find((r) => r.spec.id === focus) ?? ranRules[0]
  const focusSummary: RuleSummary | undefined = view.summary.find((s) => s.ruleId === focusRule?.spec.id)
  const focusActual = focusRule ? view.actual?.[focusRule.spec.id] ?? null : null

  // 同口径的 Python 归档:方法、段长相同,成交与成本取默认口径
  const reference = useMemo(() => {
    if (!ran || ran.executionLag !== 1 || ran.costBps !== 2.5) return null
    if (!focusRule) return null
    for (const candidate of archive.worlds.runs.filter((r) => r.method === ran.method && r.block === ran.block)) {
      const summary = candidate.summary.find((s) => {
        const spec = archive.worlds.rules.find((r) => r.id === s.ruleId)
        return spec !== undefined && sameRule(spec, focusRule.spec)
      })
      if (summary) return { run: candidate, summary }
    }
    return null
  }, [archive, ran, focusRule])

  const rows = ranRules.map((r) => {
    const s = view.summary.find((x) => x.ruleId === r.spec.id)
    const values = view.metrics[r.spec.id]?.map((m) => m[metric]) ?? []
    const actual = view.actual?.[r.spec.id]?.[metric] ?? null
    return {
      id: r.spec.id,
      label: ruleLabel(r.spec),
      color: slotColor(r.slot),
      values,
      actual,
      q: s ? s[metric] : null,
      percentile: s ? (metric === 'maxDrawdown' ? s.actualDrawdownPercentile : metric === 'cagr' ? s.actualCagrPercentile : null) : null,
    }
  })

  return (
    <div ref={root}>
      <ConfigStrip
        world={world}
        onWorld={setWorld}
        status={view.status}
        done={view.done}
        total={view.total}
        onRun={run}
        onStop={stop}
        dirty={dirty}
        runNumber={runNumber}
      />
      <div className="mt-3">
        <RuleChips
          rules={rules}
          focus={focus}
          onFocus={setFocus}
          onChange={(next) => setRules((prev) => prev.map((r) => (r.spec.id === next.spec.id ? next : r)))}
          onRemove={(id) => { setRules((prev) => prev.filter((r) => r.spec.id !== id)); if (editing === id) setEditing(null); if (focus === id) setFocus(rules.find((r) => r.spec.id !== id)?.spec.id ?? focus) }}
          onAdd={(spec) => setRules((prev) => { const slot = freeSlot(prev); return slot === null ? prev : [...prev, { spec, slot }] })}
          editing={editing}
          onEdit={setEditing}
          disabled={busy}
        />
      </div>

      {view.status === 'error' && (
        <div role="alert" className="mt-6 border border-dashed border-copper-dim px-4 py-3 text-[13px] leading-relaxed text-ink-muted">
          回测没有完成：{view.error}。可以再点一次运行；如果仍然失败，刷新页面会重新载入行情数据。
        </div>
      )}

      <div className={`mt-5 transition-opacity duration-200 ${dirty && !busy ? 'opacity-45' : ''}`}>
        {dirty && !busy && <p className="mb-3 text-[12px] text-ink-muted" role="status">配置已修改。下面仍是上一次运行的结果，运行后更新。</p>}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-10">
          <figure className="min-w-0">
            {focusRule && view.status !== 'idle' ? (
              <FanChart
                paths={view.paths[focusRule.spec.id] ?? []}
                count={view.paths[focusRule.spec.id]?.length ?? 0}
                expected={ran?.worlds ?? 500}
                actual={focusActual?.path ?? null}
                dates={view.dates}
                color={slotColor(focusRule.slot)}
                label={ruleLabel(focusRule.spec)}
                complete={view.status === 'done' || view.status === 'cancelled'}
              />
            ) : (
              <div className="flex h-[300px] items-center justify-center border border-dashed border-copper-dim md:h-[340px]">
                <p className="max-w-[34ch] text-center text-[12px] leading-relaxed text-ink-muted">点运行后，平行世界会一条条流入这里，真实历史最后落定。</p>
              </div>
            )}
            <figcaption className="num mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-ink-muted">
              {focusRule && <span className="flex items-center gap-1.5"><span aria-hidden className="h-[2px] w-3" style={{ background: slotColor(focusRule.slot) }} />真实历史 · {ruleLabel(focusRule.spec)}</span>}
              <span className="flex items-center gap-1.5"><span aria-hidden className="h-px w-3 bg-ink-muted" /><Term k="bootstrap">平行世界</Term></span>
              <span className="flex items-center gap-1.5"><span aria-hidden className="w-3 border-t border-dashed border-ink" />中位</span>
              <span className="flex items-center gap-1.5"><span aria-hidden className="h-px w-3 bg-ink-muted opacity-55" />5% 与 95%</span>
              <span className="flex items-center gap-1.5"><span aria-hidden className="w-3 border-t border-dashed border-copper" />$1 起点</span>
              {view.status === 'done' && <span className="ml-auto text-ink-faint">浏览器复算 {view.done.toLocaleString('en-US')} 个世界 · {seconds(view.elapsedMs)}</span>}
            </figcaption>
            {reference && view.status === 'done' && (
              <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
                Python 归档同口径 {reference.run.worlds} 个世界：回撤中位 <span className="num text-ink-muted">{pct(reference.summary.maxDrawdown.p50)}</span>，年化中位 <span className="num text-ink-muted">{pct(reference.summary.cagr.p50)}</span>。两边的随机数发生器不同，数值接近但不逐位相同。
              </p>
            )}
          </figure>

          <div className="grid grid-cols-2 content-start gap-x-6 gap-y-5 lg:flex lg:h-[340px] lg:flex-col lg:justify-between lg:gap-0">
            <Readout label="平行世界回撤中位" value={focusSummary?.maxDrawdown.p50 ?? null} format={(v) => pct(v)} note={focusActual && focusSummary ? `真实 ${pct(focusActual.maxDrawdown)} · 好过 ${share(focusSummary.actualDrawdownPercentile)} 的世界` : undefined} />
            <Readout label="平行世界年化中位" value={focusSummary?.cagr.p50 ?? null} format={(v) => pct(v)} note={focusActual ? `真实 ${pct(focusActual.cagr)}` : undefined} />
            <div className="col-span-2 lg:col-span-1"><Readout label="回撤深于 −70% 的世界" value={focusSummary?.pDrawdownWorse70 ?? null} format={share} /></div>
          </div>
        </div>

        {ranRules.length > 0 && view.summary.length > 0 && (
          <div className="mt-12">
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
              <h4 className="text-[13px] font-medium text-ink">每条规则在平行世界里的分布</h4>
              <div ref={metricRef} role="group" aria-label="分布指标" className="relative flex gap-4">
                <SelectionIndicator container={metricRef} selected={metric} />
                {METRICS.map((m) => (
                  <button key={m.key} type="button" aria-pressed={metric === m.key} onClick={() => setMetric(m.key)} className={`num pb-1.5 text-[11px] transition-colors ${metric === m.key ? 'text-ink' : 'text-ink-faint hover:text-ink-muted'}`}>{m.label}</button>
                ))}
              </div>
            </div>
            <StripChart rows={rows} metric={metric} worlds={view.done} />
            <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">灰色细刻度是每个平行世界，墨色细线是 5%–95%，粗段是 25%–75%，竖线是中位，菱形是真实历史。右侧百分比是<Term k="percentile">真实历史的分位</Term>。</p>
          </div>
        )}

        {view.paired && ranRules.length > 1 && (
          <div className="mt-12">
            <PairedMatrix rules={ranRules.map((r) => ({ id: r.spec.id, label: ruleLabel(r.spec), color: slotColor(r.slot) }))} paired={view.paired} metric={metric} />
          </div>
        )}
      </div>
    </div>
  )
}
