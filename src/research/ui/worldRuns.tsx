import { useState } from 'react'
import type { Archive, RuleSpec } from '../types'
import type { WorldConfig } from './Controls'
import { pct, pp, share } from './format'
import { archiveSlot, blockLabel, freeSlot, ruleLabel, slotColor } from './rules'
import type { SlottedRule } from './rules'
import { Details, RunSection, Table, td, tdNum, th, thNum } from './Section'
import { StripChart } from './StripChart'
import { Term } from './Term'

type WorldRun = Archive['worlds']['runs'][number]

const methodLabel = (m: WorldRun['method']) => (m === 'permute' ? '重排' : '有放回')
/** 归档里在各图中有固定颜色的规则;其余变体不占颜色 */
const COLORED = new Set(['three_gate_default', 'sma200_+4/-3_qqq', 'sma200_+4/-3_spy', 'tqqq_hold', 'qqq_hold'])

export function archiveRules(a: Archive, run: WorldRun): SlottedRule[] {
  const out: SlottedRule[] = []
  for (const s of run.summary) {
    const spec = a.worlds.rules.find((r) => r.id === s.ruleId)
    if (!spec || out.length >= 6) continue
    let slot = archiveSlot(spec.id)
    if (out.some((r) => r.slot === slot)) slot = freeSlot(out) ?? slot
    out.push({ spec, slot })
  }
  return out
}

export function worldOf(run: WorldRun): WorldConfig {
  return { method: run.method, block: run.block, worlds: run.worlds, seed: run.seed, executionLag: 1, costBps: 2.5 }
}

function specOf(a: Archive, id: string): RuleSpec | undefined {
  return a.worlds.rules.find((r) => r.id === id)
}

export function BootstrapRun({ a, onRerun }: { a: Archive; onRerun: (world: WorldConfig, rules: SlottedRule[]) => void }) {
  const runs = a.worlds.runs.filter((r) => r.script === 'bootstrap.py')
  const [picked, setPicked] = useState(() => runs.find((r) => r.method === 'stationary' && r.block === 250)?.id ?? runs[0]?.id)
  const run = runs.find((r) => r.id === picked) ?? runs[0]
  if (!run) return null
  const gate = (r: WorldRun) => r.summary.find((s) => s.ruleId === 'three_gate')
  const hold = (r: WorldRun, id: string) => r.summary.find((s) => s.ruleId === id)
  const shuffled = runs.filter((r) => r.block > 1)
  const gateMdd = shuffled.map((r) => gate(r)?.maxDrawdown.p50 ?? 0)
  const pctl = shuffled.map((r) => gate(r)?.actualDrawdownPercentile ?? 0)
  const daily = runs.find((r) => r.block === 1)
  const rows = run.strips.map((strip) => {
    const s = run.summary.find((x) => x.ruleId === strip.ruleId)
    const spec = specOf(a, strip.ruleId)
    return {
      id: strip.ruleId,
      label: spec ? ruleLabel(spec) : strip.ruleId,
      color: slotColor(archiveSlot(strip.ruleId)),
      values: strip.maxDrawdown,
      actual: run.actual[strip.ruleId]?.maxDrawdown ?? null,
      q: s?.maxDrawdown ?? null,
      percentile: s?.actualDrawdownPercentile ?? null,
    }
  })
  const actualGate = run.actual.three_gate
  return (
    <RunSection
      id="run-04"
      run="RUN 04"
      title="打乱历史顺序以后，三门仍几乎总比持有 TQQQ 浅，但 −54% 很少见"
      config={[`${runs.length} 组构造方式`, `每组 ${run.worlds} 个世界`, `种子 ${run.seed}`, '次日收盘 · 2.5bp', 'bootstrap.py']}
      lede={<>
        <p>每个交易日的纳指、TQQQ、QQQ 和现金收益作为一组，按段打乱后重建价格、重算信号，这就是<Term k="bootstrap">平行世界</Term>。<Term k="permute">重排</Term>让每天恰好出现一次，<Term k="stationary">有放回</Term>允许某些时期多抽或少抽。</p>
        <p>段长 1 个月以上时，三门的<Term k="drawdown">回撤</Term>中位在 <strong>{pct(Math.min(...gateMdd), 0)} 到 {pct(Math.max(...gateMdd), 0)}</strong> 之间，真实历史的 {actualGate ? pct(actualGate.maxDrawdown, 0) : ''} 排在它分布的 <strong>{share(Math.min(...pctl))}–{share(Math.max(...pctl))}</strong> 分位。{daily && <>段长 1 天会打散波动聚集，三门年化中位跌到 {pct(gate(daily)?.cagr.p50 ?? 0)}，说明它依赖的正是“高波动日扎堆出现”。</>}</p>
      </>}
    >
      <Table caption="各构造方式下三门与持有的平行世界中位数">
        <thead>
          <tr className="border-b border-edge">
            <th scope="col" className={th}>构造方式</th><th scope="col" className={th}>段长</th>
            <th scope="col" className={thNum}>三门年化中位</th><th scope="col" className={thNum}>三门回撤中位</th>
            <th scope="col" className={thNum}>持有 TQQQ 回撤</th><th scope="col" className={thNum}>持有 QQQ 回撤</th>
            <th scope="col" className={thNum}>三门回撤深于 −70%</th><th scope="col" className={thNum}>三门浅于持有 TQQQ</th><th scope="col" className={thNum}>真实历史分位</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const g = gate(r)
            const active = r.id === run.id
            return (
              <tr key={r.id} onClick={() => setPicked(r.id)} className={`cursor-pointer border-b border-edge transition-colors ${active ? 'bg-void-raised' : 'hover:bg-void-raised/60'}`}>
                <th scope="row" className={`${td} font-normal`}>
                  <button type="button" onClick={() => setPicked(r.id)} aria-pressed={active} className={`text-left ${active ? 'text-ink' : 'text-ink-muted'}`}>{methodLabel(r.method)}</button>
                </th>
                <td className={`${td} num ${active ? '' : 'text-ink-muted'}`}>{blockLabel(r.block)}</td>
                <td className={tdNum}>{g ? pct(g.cagr.p50) : '—'}</td>
                <td className={tdNum}>{g ? pct(g.maxDrawdown.p50) : '—'}</td>
                <td className={`${tdNum} text-ink-muted`}>{pct(hold(r, 'tqqq_hold')?.maxDrawdown.p50 ?? 0)}</td>
                <td className={`${tdNum} text-ink-muted`}>{pct(hold(r, 'qqq_hold')?.maxDrawdown.p50 ?? 0)}</td>
                <td className={tdNum}>{g ? share(g.pDrawdownWorse70) : '—'}</td>
                <td className={tdNum}>{share(r.paired.three_gate?.tqqq_hold?.maxDrawdown ?? 0)}</td>
                <td className={tdNum}>{g ? share(g.actualDrawdownPercentile) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </Table>
      <div className="mt-10">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="text-[13px] font-medium text-ink">{methodLabel(run.method)} · 段长 {blockLabel(run.block)}：{run.worlds} 个世界的最大回撤</h3>
          <button type="button" onClick={() => onRerun(worldOf(run), archiveRules(a, run))} className="inline-flex items-center gap-1.5 border border-edge px-2.5 py-1.5 text-[12px] text-ink-muted transition-colors hover:border-copper hover:text-ink">在浏览器里用这种构造方式复跑</button>
        </div>
        <StripChart rows={rows} metric="maxDrawdown" worlds={run.worlds} />
        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">点表格里的一行切换构造方式。分布条来自 Python 归档的逐世界结果。</p>
      </div>
    </RunSection>
  )
}

export function DecayDetails({ a }: { a: Archive }) {
  const runs = a.worlds.runs.filter((r) => r.script === 'bootstrap_params.py')
  const [picked, setPicked] = useState(() => runs.find((r) => r.method === 'stationary' && r.block === 250)?.id ?? runs[0]?.id)
  const run = runs.find((r) => r.id === picked) ?? runs[0]
  if (!run) return null
  return (
    <Details summary={`${run.summary.length} 条规则的衰退明细：真实历史与平行世界中位数`}>
      <div role="group" aria-label="构造方式" className="mb-4 flex flex-wrap gap-2">
        {runs.map((r) => (
          <button key={r.id} type="button" aria-pressed={r.id === run.id} onClick={() => setPicked(r.id)} className={`border px-2.5 py-1.5 text-[12px] transition-colors ${r.id === run.id ? 'border-copper text-ink' : 'border-edge text-ink-muted hover:border-copper hover:text-ink'}`}>{methodLabel(r.method)} · {blockLabel(r.block)}</button>
        ))}
      </div>
      <Table caption="各规则在真实历史与平行世界中的年化和回撤">
        <thead>
          <tr className="border-b border-edge">
            <th scope="col" className={th}>规则</th>
            <th scope="col" className={thNum}>真实年化</th><th scope="col" className={thNum}>平行中位</th><th scope="col" className={thNum}>差</th>
            <th scope="col" className={thNum}>真实回撤</th><th scope="col" className={thNum}>平行中位</th><th scope="col" className={thNum}>差</th>
            <th scope="col" className={thNum}>深于 −70%</th><th scope="col" className={thNum}>真实分位</th><th scope="col" className={thNum}>Sharpe 胜 QQQ</th>
          </tr>
        </thead>
        <tbody>
          {run.summary.map((s) => {
            const spec = specOf(a, s.ruleId)
            const act = run.actual[s.ruleId]
            const sharpeVsQqq = run.paired[s.ruleId]?.qqq_hold?.sharpe
            return (
              <tr key={s.ruleId} className="border-b border-edge">
                <th scope="row" className={`${td} font-normal`}>
                  <span className="flex items-center gap-2"><span aria-hidden className="h-[2px] w-3 shrink-0" style={{ background: COLORED.has(s.ruleId) ? slotColor(archiveSlot(s.ruleId)) : 'transparent' }} />{spec ? ruleLabel(spec) : s.ruleId}</span>
                </th>
                <td className={`${tdNum} text-ink-muted`}>{act ? pct(act.cagr) : '—'}</td>
                <td className={tdNum}>{pct(s.cagr.p50)}</td>
                <td className={`${tdNum} text-ink-muted`}>{act ? pp(s.cagr.p50 - act.cagr) : '—'}</td>
                <td className={`${tdNum} text-ink-muted`}>{act ? pct(act.maxDrawdown) : '—'}</td>
                <td className={tdNum}>{pct(s.maxDrawdown.p50)}</td>
                <td className={`${tdNum} text-ink-muted`}>{act ? pp(s.maxDrawdown.p50 - act.maxDrawdown) : '—'}</td>
                <td className={tdNum}>{share(s.pDrawdownWorse70)}</td>
                <td className={tdNum}>{share(s.actualDrawdownPercentile)}</td>
                <td className={tdNum}>{sharpeVsQqq === undefined ? '—' : share(sharpeVsQqq)}</td>
              </tr>
            )
          })}
        </tbody>
      </Table>
      <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">“差”是平行世界中位减真实历史，单位为百分点。Sharpe 胜 QQQ 只对归档保留了配对结果的规则显示。数字来自 Python 归档，{run.worlds} 个世界，种子 {run.seed}。</p>
    </Details>
  )
}
