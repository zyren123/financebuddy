import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { springs } from '../motion/spring'
import { useSpring } from '../motion/useSpring'
import { PlusIcon, CloseIcon } from '../ui/icons'
import { loadArchive } from './engine/loadDataset'
import type { Archive } from './types'
import { MatchedRun, ParamsRun, ScreenRun } from './ui/archiveRuns'
import type { WorldConfig } from './ui/Controls'
import { pct, share } from './ui/format'
import { LiveRun } from './ui/LiveRun'
import { DEFAULT_WORLD, archiveSlot, defaultRules, ruleId, slotColor } from './ui/rules'
import type { SlottedRule } from './ui/rules'
import { RunSection } from './ui/Section'
import { Term } from './ui/Term'
import { BootstrapRun, DecayDetails, worldOf } from './ui/worldRuns'

let archivePromise: Promise<Archive> | null = null

function useArchive() {
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'ready'; archive: Archive } | { kind: 'error'; message: string }>({ kind: 'loading' })
  const load = useCallback(() => {
    setState({ kind: 'loading' })
    const pending = archivePromise ?? loadArchive().catch((error: unknown) => { archivePromise = null; throw error })
    archivePromise = pending
    pending.then((archive) => setState({ kind: 'ready', archive }), (error: unknown) => setState({ kind: 'error', message: error instanceof Error ? error.message : '研究归档没有载入' }))
  }, [])
  useEffect(() => { load() }, [load])
  return { state, retry: load }
}

interface Experiment { key: string; run: string; world: WorldConfig; rules: SlottedRule[] }
const MAX_EXPERIMENTS = 4

/** 复制规则并换新 id,同一条规则可以同时出现在多个实验里 */
function fresh(rules: SlottedRule[]): SlottedRule[] {
  return rules.map((r) => ({ slot: r.slot, spec: { ...r.spec, id: ruleId() } }))
}

function RunNav({ items, active }: { items: { id: string; label: string }[]; active: string }) {
  const list = useRef<HTMLOListElement>(null)
  const line = useRef<HTMLSpanElement>(null)
  const [bounds, setBounds] = useState([0, 0])
  useLayoutEffect(() => {
    const el = list.current?.querySelector<HTMLElement>(`[data-run="${active}"]`)
    if (el) setBounds([el.offsetTop, el.offsetHeight])
  }, [active, items.length])
  useSpring(bounds, ([y, h]) => {
    if (line.current) line.current.style.transform = `translate3d(0,${y}px,0) scaleY(${h})`
  }, springs.selection)
  return (
    <nav aria-label="实验记录" className="relative">
      <span ref={line} aria-hidden className="absolute left-0 top-0 hidden h-px w-px origin-top bg-copper lg:block" />
      <ol ref={list} className="flex gap-x-5 gap-y-0 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
        {items.map((item) => (
          <li key={item.id} data-run={item.id} className="shrink-0">
            <a
              href={`#${item.id}`}
              aria-current={active === item.id ? 'location' : undefined}
              onClick={(event) => {
                event.preventDefault()
                document.getElementById(item.id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })
              }}
              className={`num block py-1.5 text-[11px] leading-relaxed transition-colors lg:pl-4 ${active === item.id ? 'text-ink' : 'text-ink-faint hover:text-ink-muted'}`}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

function useScrollSpy(ids: string[]) {
  const [active, setActive] = useState(ids[0])
  const current = useRef(ids)
  current.current = ids
  // 只在 id 集合变化时重连观察器;数组每次渲染都是新的
  const key = ids.join(',')
  useEffect(() => {
    const ids = current.current
    const visible = new Map<string, number>()
    const observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top)
        else visible.delete(e.target.id)
      }
      const first = ids.find((id) => visible.has(id))
      if (first) setActive(first)
    }, { rootMargin: '-15% 0px -65% 0px' })
    for (const id of ids) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [key])
  return active
}

function Console({ a }: { a: Archive }) {
  const params = a.worlds.runs.filter((r) => r.script === 'bootstrap_params.py')
  const featured = params.find((r) => r.method === 'stationary' && r.block === 250) ?? params[0]
  const gateRows = params.map((r) => r.summary.find((s) => s.ruleId === 'three_gate_default')).filter((s) => s !== undefined)
  const smaRows = params.flatMap((r) => r.summary.filter((s) => s.ruleId.startsWith('sma200')))
  const actualGate = featured?.actual.three_gate_default
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [dropped, setDropped] = useState(0)
  const next = useRef(6)
  const pendingScroll = useRef<string | null>(null)

  const addExperiment = useCallback((world: WorldConfig, rules: SlottedRule[]) => {
    const run = `RUN ${String(next.current).padStart(2, '0')}`
    const key = `exp-${next.current}`
    next.current += 1
    pendingScroll.current = key
    const list = [{ key, run, world, rules: fresh(rules) }, ...experiments]
    if (list.length > MAX_EXPERIMENTS) setDropped((d) => d + list.length - MAX_EXPERIMENTS)
    setExperiments(list.slice(0, MAX_EXPERIMENTS))
  }, [experiments])

  useEffect(() => {
    const key = pendingScroll.current
    if (!key) return
    pendingScroll.current = null
    document.getElementById(key)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })
  }, [experiments])

  const nav = [
    { id: 'run-05', label: '05 参数 × 平行世界' },
    { id: 'run-04', label: '04 平行世界' },
    { id: 'run-03', label: '03 择时贡献 · 标普' },
    { id: 'run-02', label: '02 分段参数' },
    { id: 'run-01', label: '01 规则族筛选' },
    { id: 'mine', label: experiments.length ? `我的实验 · ${experiments.length}` : '我的实验' },
  ]
  const active = useScrollSpy(nav.map((n) => n.id))
  const gateMdd = gateRows.map((s) => s.maxDrawdown.p50)
  const gatePct = gateRows.map((s) => s.actualDrawdownPercentile)
  const smaPct = smaRows.map((s) => s.actualDrawdownPercentile)
  const smaMdd = smaRows.map((s) => s.maxDrawdown.p50)

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-x-12 gap-y-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="min-w-0 lg:sticky lg:top-[88px] lg:self-start">
        <RunNav items={nav} active={active} />
        <p className="num mt-6 hidden text-[11px] leading-relaxed text-ink-faint lg:block">
          归档 {a.generated.date}<br />commit {a.generated.commit.slice(0, 7)}<br />{a.generated.start} — {a.generated.end}
        </p>
      </aside>

      <div className="min-w-0">
        <header>
          <h2 className="max-w-[20ch] font-display text-[clamp(2rem,4vw,3rem)] leading-[1.05] text-ink xl:max-w-none">三门挡得住归零，{actualGate ? `${pct(actualGate.maxDrawdown, 0)} ` : ''}回撤却是幸运路径</h2>
          <p className="mt-4 max-w-[52em] text-[17px] leading-[1.625] text-ink-muted">
            在打乱历史顺序造出的<Term k="bootstrap">平行世界</Term>里，三门的回撤中位是 <span className="num text-ink">{pct(Math.max(...gateMdd), 0)} 到 {pct(Math.min(...gateMdd), 0)}</span>，真实历史好过其中 <span className="num text-ink">{share(Math.min(...gatePct))}–{share(Math.max(...gatePct))}</span> 的世界，实际使用应按这个区间准备。SMA200 更深，回撤中位 <span className="num text-ink">{pct(Math.max(...smaMdd), 0)} 到 {pct(Math.min(...smaMdd), 0)}</span>，但真实历史只好过 <span className="num text-ink">{share(Math.min(...smaPct))}–{share(Math.max(...smaPct))}</span> 的世界，更接近它的常态。
          </p>
        </header>

        {featured && (
          <section id="run-05" aria-label="RUN 05 参数 × 平行世界" className="scroll-mt-24 pt-7">
            <LiveRun runNumber="RUN 05" initialWorld={worldOf(featured)} initialRules={defaultRules()} autorun archive={a} />
            <div className="mt-14 max-w-[38em] space-y-3 text-[17px] leading-[1.625] text-ink-muted">
              <h3 className="font-display text-[clamp(2rem,4vw,3rem)] leading-[1.05] text-ink">换参数，衰退还在</h3>
              <p>Python 归档在同一批世界里比较了三门的 {featured.summary.filter((s) => s.ruleId.startsWith('three_gate')).length} 个参数变体。每个变体的平行世界回撤都比它的真实历史深得多，衰退分布在整个参数族，不是作者参数特别走运。真实历史上最好的变体衰退最多，这是按历史挑参数的典型后果。</p>
              <p>上面的实验台可以换构造方式、段长和规则。改完点“运行新配置”，扇面和读数会随世界流入逐步收敛。</p>
            </div>
            <DecayDetails a={a} />
          </section>
        )}

        <BootstrapRun a={a} onRerun={addExperiment} />
        <MatchedRun a={a} />
        <ParamsRun a={a} colors={{ gate: slotColor(archiveSlot('three_gate_default')), tqqq: slotColor(archiveSlot('tqqq_hold')), qqq: slotColor(archiveSlot('qqq_hold')) }} />
        <ScreenRun a={a} />

        <RunSection
          id="mine"
          run="我的实验"
          title="我的实验"
          lede={<p>用任意构造方式和规则组合新建一次实验。结果只保存在当前会话，刷新页面后清空；最多保留 {MAX_EXPERIMENTS} 次，更早的会被移除。</p>}
        >
          <button type="button" onClick={() => addExperiment({ ...DEFAULT_WORLD }, defaultRules())} className="inline-flex items-center gap-1.5 bg-ink px-3 py-1.5 text-[12px] font-medium text-void transition-colors hover:bg-ink-muted">
            <PlusIcon /> 新建实验
          </button>
          {dropped > 0 && <p className="mt-3 text-[12px] text-ink-faint" role="status">已移除 {dropped} 次较早的实验。</p>}
          <ol className="mt-10 space-y-20">
            {experiments.map((e) => (
              <li key={e.key} id={e.key} className="scroll-mt-24">
                <div className="mb-2 flex justify-end">
                  <button type="button" onClick={() => setExperiments((prev) => prev.filter((x) => x.key !== e.key))} className="inline-flex items-center gap-1 p-1 text-[11px] text-ink-faint transition-colors hover:text-down"><CloseIcon /> 移除 {e.run}</button>
                </div>
                <LiveRun runNumber={e.run} initialWorld={e.world} initialRules={e.rules} archive={a} />
              </li>
            ))}
          </ol>
        </RunSection>
      </div>
    </div>
  )
}

/** Admin 专用页签:研究报告为主,内嵌可复跑的平行世界实验台 */
export default function ResearchConsole() {
  const { state, retry } = useArchive()
  if (state.kind === 'loading') {
    return (
      <div className="flex h-64 items-center justify-center">
        <div role="status" className="border border-dashed border-copper-dim px-4 py-3 text-[12px] text-ink-muted">正在载入研究归档…</div>
      </div>
    )
  }
  if (state.kind === 'error') {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <div role="alert" className="max-w-[40ch] border border-dashed border-copper-dim px-4 py-3 text-center text-[12px] leading-relaxed text-ink-muted">研究归档没有载入：{state.message}</div>
        <button type="button" onClick={retry} className="border border-edge px-2.5 py-1.5 text-[12px] text-ink-muted transition-colors hover:border-copper hover:text-ink">重新载入</button>
      </div>
    )
  }
  return <Console a={state.archive} />
}
