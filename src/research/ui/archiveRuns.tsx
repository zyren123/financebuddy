import { Fragment, useState } from 'react'
import { CHART_COLORS } from '../../charts/theme'
import type { Archive, SegmentKey, WindowMetrics } from '../types'
import { num, pct, pp, share } from './format'
import { GATE_AXES, archiveSlot, slotColor } from './rules'
import { Details, RunSection, Stat, Table, td, tdNum, th, thNum } from './Section'
import { Term } from './Term'

const FAMILY: Record<string, string> = {
  three_gate: '三门', sma: '均线', dual_ma: '双均线', tsmom: '时间序列动量', vol_target: '波动目标',
  fixed_mix: '固定比例', trend_vol: '趋势 × 波动目标', spysim_sma: 'SPYSIM 均线', baseline: '基准',
}

export function segmentLabel(a: Archive, key: SegmentKey): string {
  const start = a.generated.start.slice(0, 4)
  const split = a.generated.split.slice(0, 4)
  const end = a.generated.end.slice(0, 4)
  return key === 'pre2010' ? `${start}–${Number(split) - 1} 合成` : key === 'post2010' ? `${split}–${end} 真实` : `${start}–${end} 全区间`
}

const SEGMENTS: SegmentKey[] = ['pre2010', 'post2010', 'full']

function SharpeScatter({ trials, highlight }: { trials: Archive['screen']['trials']; highlight: { label: string; name: string; color: string }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 640, H = 360, L = 48, R = 16, T = 16, B = 40
  const xs = trials.map((t) => t.isSharpe), ys = trials.map((t) => t.oosSharpe)
  const lo = Math.floor(Math.min(...xs, ...ys) * 10) / 10 - 0.05
  const hi = Math.ceil(Math.max(...xs, ...ys) * 10) / 10 + 0.05
  const x = (v: number) => L + ((v - lo) / (hi - lo)) * (W - L - R)
  const y = (v: number) => H - B - ((v - lo) / (hi - lo)) * (H - T - B)
  const grid: number[] = []
  for (let v = Math.ceil(lo * 5) / 5; v <= hi; v += 0.2) grid.push(Math.round(v * 10) / 10)
  const hit = hover !== null ? trials[hover] : null
  return (
    <figure className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="48 个试验的样本内与样本外 Sharpe">
        {grid.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={CHART_COLORS.grid} />
            <line y1={T} y2={H - B} x1={x(v)} x2={x(v)} stroke={CHART_COLORS.grid} />
            <text x={L - 8} y={y(v)} dy="0.32em" textAnchor="end" className="num fill-ink-muted text-[10px]">{v.toFixed(1)}</text>
            <text x={x(v)} y={H - B + 16} textAnchor="middle" className="num fill-ink-muted text-[10px]">{v.toFixed(1)}</text>
          </g>
        ))}
        <line x1={x(lo)} y1={y(lo)} x2={x(hi)} y2={y(hi)} stroke={CHART_COLORS.crosshair} strokeWidth="1" />
        <text x={x(hi) - 4} y={y(hi) + 14} textAnchor="end" className="fill-ink-faint text-[10px]">样本内 = 样本外</text>
        <text x={(L + W - R) / 2} y={H - 6} textAnchor="middle" className="fill-ink-muted text-[11px]">样本内 Sharpe（1986–2009 合成）</text>
        <text transform={`translate(14 ${(T + H - B) / 2}) rotate(-90)`} textAnchor="middle" className="fill-ink-muted text-[11px]">样本外 Sharpe（2010 后真实）</text>
        {trials.map((t, i) => {
          const mark = highlight.find((h) => h.label === t.label)
          return (
            <g key={t.label} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
              <circle cx={x(t.isSharpe)} cy={y(t.oosSharpe)} r="12" fill="transparent" />
              <circle cx={x(t.isSharpe)} cy={y(t.oosSharpe)} r={mark ? 5.5 : 4} fill={mark ? mark.color : t.postHoc ? CHART_COLORS.surface : '#868686'} stroke={t.postHoc && !mark ? CHART_COLORS.muted : CHART_COLORS.surface} strokeWidth={t.postHoc && !mark ? 1.25 : 2} />
              {mark && <text x={x(t.isSharpe) + 9} y={y(t.oosSharpe)} dy="0.32em" className="fill-ink text-[11px]">{mark.name}</text>}
            </g>
          )
        })}
      </svg>
      {hit && (
        <div className="pointer-events-none absolute right-0 top-0 border border-edge bg-void-raised px-3 py-2">
          <div className="num text-[11px] text-ink">{hit.label}</div>
          <div className="mt-0.5 text-[11px] text-ink-muted">{FAMILY[hit.family] ?? hit.family}{hit.postHoc ? ' · 事后规则' : ''}</div>
          <div className="num mt-1 text-[11px] text-ink-muted">样本内 {num(hit.isSharpe)} · 样本外 {num(hit.oosSharpe)}</div>
        </div>
      )}
      <figcaption className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-ink-muted">
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-full bg-ink-faint" />预注册试验</span>
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-full border border-ink-muted" /><Term k="posthoc">事后规则</Term></span>
        {highlight.map((h) => <span key={h.label} className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-full" style={{ background: h.color }} />{h.name}</span>)}
      </figcaption>
    </figure>
  )
}

function metricsCells(m: WindowMetrics) {
  return <><td className={tdNum}>{pct(m.cagr)}</td><td className={tdNum}>{pct(m.maxDrawdown)}</td><td className={tdNum}>{num(m.sharpe)}</td></>
}

export function ScreenRun({ a }: { a: Archive }) {
  const s = a.screen
  const gate = s.finalists.find((f) => f.family === 'three_gate')
  const fresh = s.finalists.find((f) => f.selectedAs.includes('不含事后规则'))
  const families = s.finalists.filter((f) => f.family !== 'baseline')
  return (
    <RunSection
      id="run-01"
      run="RUN 01"
      archiveOnly
      title="按样本内挑规则，在真实 TQQQ 上挑不出赢家"
      config={[`${s.nTrials} 个预注册试验`, `${segmentLabel(a, 'pre2010')}选参`, `${segmentLabel(a, 'post2010')}检验`, '按样本内 Sharpe 选优', 'screen.py']}
      lede={<>
        <p>均线、双均线、动量、波动目标、固定比例和趋势加波动目标，参数网格在看到结果前写死。每族按<Term k="insample">样本内</Term> <Term k="sharpe">Sharpe</Term> 选出最优，再到 2010 年以后的真实 TQQQ 上只检验一次。<Term k="synthetic">合成 TQQQ</Term> 负责样本内。</p>
        <p>结果是样本内排名对样本外没有预测力。不含<Term k="posthoc">事后规则</Term>时，样本内最优的 <strong>{fresh?.label}</strong> 在样本外排第 <strong>{fresh?.oosRank} / {s.nTrials}</strong>。三门在三段都排第一，但它的参数本来就是在这两段数据上调出来的。</p>
      </>}
    >
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_220px]">
        <SharpeScatter trials={s.trials} highlight={[
          ...(gate ? [{ label: gate.label, name: '三门', color: slotColor(archiveSlot('three_gate')) }] : []),
          ...(fresh ? [{ label: fresh.label, name: '不含事后规则的最优', color: CHART_COLORS.ink }] : []),
        ]} />
        <div className="grid grid-cols-2 content-start gap-x-6 gap-y-5 lg:grid-cols-1">
          <Stat label={<>样本内外 Sharpe <Term k="spearman">秩相关</Term></>} value={num(s.spearman, 3)} note="0 表示排名毫无关系" />
          <Stat label={<><Term k="pbo">PBO</Term> · 全部 {s.nTrials} 个</>} value={share(s.pbo)} note={`去掉事后规则后 ${share(s.pboExcludingPostHoc)}`} />
          {s.dsr.map((d) => <Stat key={`${d.label}-${d.trials}`} label={<><Term k="dsr">DSR</Term> · {d.label} · N={d.trials}</>} value={num(d.dsr, 3)} note="只检验是否跑赢现金" />)}
        </div>
      </div>
      <div className="mt-12">
        <h3 className="mb-4 text-[13px] font-medium text-ink">各族样本内最优，在样本外的表现</h3>
        <Table caption="各规则族样本内最优在样本内外的指标">
          <thead>
            <tr className="border-b border-edge">
              <th scope="col" className={th}>规则</th>
              <th scope="col" className={th}>入选原因</th>
              <th scope="col" className={thNum}>样本内年化</th><th scope="col" className={thNum}>回撤</th><th scope="col" className={thNum}>Sharpe</th>
              <th scope="col" className={thNum}>样本外年化</th><th scope="col" className={thNum}>回撤</th><th scope="col" className={thNum}>Sharpe</th>
            </tr>
          </thead>
          <tbody>
            {s.finalists.map((f) => (
              <tr key={f.label} className={`border-b border-edge ${f.family === 'baseline' ? 'text-ink-muted' : ''}`}>
                <th scope="row" className={`${td} num font-normal`}>{f.label}</th>
                <td className={`${td} text-ink-muted`}>{f.selectedAs}</td>
                {metricsCells(f.is)}{metricsCells(f.oos)}
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="mt-3 text-[11px] text-ink-faint">{families.length} 条入选规则，按入选原因排列。数字来自 Python 归档 finalists.csv。</p>
      </div>
    </RunSection>
  )
}

function RangeRows({ rows, domain, format }: {
  rows: { label: string; q: { p05: number; p25: number; p50: number; p75: number; p95: number }; marks: { color: string; value: number; name: string }[] }[]
  domain: [number, number]
  format: (v: number) => string
}) {
  const x = (v: number) => `${((Math.max(domain[0], Math.min(domain[1], v)) - domain[0]) / (domain[1] - domain[0])) * 100}%`
  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-4">
          <span className="text-[11px] text-ink-muted">{r.label}</span>
          <div className="relative h-6">
            <span className="absolute top-1/2 h-px bg-edge" style={{ left: 0, right: 0 }} />
            <span className="absolute top-1/2 h-px -translate-y-1/2 bg-ink" style={{ left: x(r.q.p05), width: `calc(${x(r.q.p95)} - ${x(r.q.p05)})` }} />
            <span className="absolute top-1/2 h-1 -translate-y-1/2 bg-ink" style={{ left: x(r.q.p25), width: `calc(${x(r.q.p75)} - ${x(r.q.p25)})` }} />
            <span className="absolute top-0 h-6 w-0.5 -translate-x-1/2 bg-ink" style={{ left: x(r.q.p50) }} />
            {r.marks.map((m) => (
              <span key={m.name} title={`${m.name} ${format(m.value)}`} className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 ring-2 ring-void" style={{ left: x(m.value), background: m.color }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function ParamsRun({ a, colors }: { a: Archive; colors: { gate: string; tqqq: string; qqq: string } }) {
  const p = a.params
  const tqqq = p.baselines.find((b) => b.rule === 'tqqq_hold')
  const qqq = p.baselines.find((b) => b.rule === 'qqq_hold')
  const author = Object.fromEntries(SEGMENTS.map((k) => [k, p.sweep.find((r) => r.isDefault)?.segments[k]])) as Record<SegmentKey, WindowMetrics | undefined>
  const post = p.grid.segments.post2010
  const marks = (key: SegmentKey, metric: 'cagr' | 'maxDrawdown') => [
    ...(tqqq ? [{ color: colors.tqqq, value: tqqq.segments[key][metric], name: '持有 TQQQ' }] : []),
    ...(qqq ? [{ color: colors.qqq, value: qqq.segments[key][metric], name: '持有 QQQ' }] : []),
    ...(author[key] ? [{ color: colors.gate, value: author[key][metric], name: '三门 · 作者参数' }] : []),
  ]
  const axes = [...new Set(p.sweep.map((r) => r.axis))]
  return (
    <RunSection
      id="run-02"
      run="RUN 02"
      archiveOnly
      title="三门压回撤的作用换参数也成立，2010 年后的收益优势不成立"
      config={[`${p.grid.size} 组三阈值网格`, '7 个参数逐个扫描', '2010 前后分段', 'three_gate_params.py']}
      lede={<>
        <p>波动上限、冲击上限和回撤退出线同时变化，共 {p.grid.size} 组。{SEGMENTS.map((k) => segmentLabel(a, k)).join('、')}三段分开算。</p>
        <p>所有组合的回撤都比同段持有 TQQQ 浅（2010 年后 <strong>{share(post.shareDrawdownShallowerThanTqqq)}</strong>）。但 2010 年后年化超过持有 TQQQ 的只有 <strong>{share(post.shareCagrAboveTqqq)}</strong>。两段之间年化排名的秩相关是 {num(p.grid.rankCorrelation.cagr, 2)}，回撤只有 {num(p.grid.rankCorrelation.maxDrawdown, 2)}：哪组参数回撤最浅，两段并不一致。作者参数按 Sharpe 在 {p.grid.size} 组里排第 {p.grid.defaultSharpeRank.full}，不是网格里的最优点。</p>
      </>}
    >
      <div className="grid gap-10 md:grid-cols-2 md:gap-14">
        <figure>
          <figcaption className="mb-4 text-[12px] text-ink">{p.grid.size} 组参数的年化</figcaption>
          <RangeRows rows={SEGMENTS.map((k) => ({ label: segmentLabel(a, k), q: p.grid.segments[k].cagr, marks: marks(k, 'cagr') }))} domain={[-0.05, 0.5]} format={pct} />
        </figure>
        <figure>
          <figcaption className="mb-4 text-[12px] text-ink">{p.grid.size} 组参数的最大回撤</figcaption>
          <RangeRows rows={SEGMENTS.map((k) => ({ label: segmentLabel(a, k), q: p.grid.segments[k].maxDrawdown, marks: marks(k, 'maxDrawdown') }))} domain={[-1, 0]} format={pct} />
        </figure>
      </div>
      <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-ink-muted">
        <span>细线 5%–95% · 粗段 25%–75% · 竖线中位</span>
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rotate-45" style={{ background: colors.gate }} />三门 · 作者参数</span>
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rotate-45" style={{ background: colors.tqqq }} />持有 TQQQ</span>
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rotate-45" style={{ background: colors.qqq }} />持有 QQQ</span>
      </p>
      <Details summary="每次只改一个参数的明细（其余取作者值）">
        <Table caption="三门单参数扫描，分段年化与回撤">
          <thead>
            <tr className="border-b border-edge">
              <th scope="col" className={th}>参数</th><th scope="col" className={th}>取值</th>
              {SEGMENTS.map((k) => <th key={k} scope="colgroup" colSpan={2} className={thNum}>{segmentLabel(a, k)}</th>)}
            </tr>
          </thead>
          <tbody>
            {axes.map((axis) => p.sweep.filter((r) => r.axis === axis).map((r, i) => (
              <tr key={`${axis}-${r.value}`} className={`border-b border-edge ${r.isDefault ? 'text-ink' : 'text-ink-muted'}`}>
                <th scope="row" className={`${td} font-normal ${i ? 'text-transparent' : 'text-ink-muted'}`}>{GATE_AXES[axis].label}</th>
                <td className={`${td} num ${r.isDefault ? 'text-ink' : 'text-ink-muted'}`}>{GATE_AXES[axis].format(r.value)}{r.isDefault ? ' · 作者' : ''}</td>
                {SEGMENTS.map((k) => <Fragment key={k}><td className={`${tdNum} ${r.isDefault ? '' : 'text-ink-muted'}`}>{pct(r.segments[k].cagr)}</td><td className={`${tdNum} ${r.isDefault ? '' : 'text-ink-muted'}`}>{pct(r.segments[k].maxDrawdown)}</td></Fragment>)}
              </tr>
            )))}
          </tbody>
        </Table>
        <p className="mt-3 text-[11px] text-ink-faint">每段两列：年化、最大回撤。粗体行为作者参数。</p>
      </Details>
    </RunSection>
  )
}

export function MatchedRun({ a }: { a: Archive }) {
  const m = a.matched
  const grid = m.gridMedian.post2010
  const nearest = [...m.fixedMix].sort((x, y) => Math.abs(x.segments.post2010.maxDrawdown - grid.maxDrawdown) - Math.abs(y.segments.post2010.maxDrawdown - grid.maxDrawdown))[0]
  const timing = nearest ? grid.cagr - nearest.segments.post2010.cagr : 0
  const sp = m.sp500
  return (
    <RunSection
      id="run-03"
      run="RUN 03"
      archiveOnly
      title="回撤相近时择时的贡献不大，换到标普上优势几乎消失"
      config={['固定比例 TQQQ / T-bill · 再平衡带 10 个百分点', '标普 500 信号 · 合成 3 倍标普总收益', `${a.params.grid.size} 组网格`]}
      lede={<>
        <p>三门跑赢 QQQ 的年化有一部分只是杠杆。拿回撤相近的固定比例 TQQQ 对照，剩下的差距才归功于择时：2010 年后网格中位数比固定 {Math.round((nearest?.weight ?? 0) * 100)}% TQQQ 每年多 <strong>{pp(timing)} 个百分点</strong>，Sharpe 是 {num(grid.sharpe)} 对 {num(nearest?.segments.post2010.sharpe ?? 0)}。</p>
        <p>把三门原样搬到标普 500 上：全区间 Sharpe 中位 {num(sp.grid.full.sharpeMedian)}，1 倍持有 {num(sp.hold1x.full.sharpe)}；Sharpe 超过 1 倍持有的组合只有 {share(sp.grid.full.shareSharpeAbove1x)}，最差一组回撤 {pct(sp.grid.full.drawdownWorst)}。纳指上的优势很大一部分来自 2000–2002 年那种先波动飙升、再长期深跌的形态。</p>
      </>}
    >
      <div className="grid gap-12 lg:grid-cols-2">
        <div>
          <h3 className="mb-4 text-[13px] font-medium text-ink">{segmentLabel(a, 'post2010')}：三门对照固定比例</h3>
          <Table caption="2010 后三门网格中位数与固定比例 TQQQ">
            <thead><tr className="border-b border-edge"><th scope="col" className={th}>规则</th><th scope="col" className={thNum}>年化</th><th scope="col" className={thNum}>回撤</th><th scope="col" className={thNum}>Sharpe</th></tr></thead>
            <tbody>
              <tr className="border-b border-edge"><th scope="row" className={`${td} font-normal`}>三门 · {a.params.grid.size} 组中位</th>{metricsCells(grid)}</tr>
              {m.fixedMix.map((f) => (
                <tr key={f.weight} className={`border-b border-edge ${f === nearest ? '' : 'text-ink-muted'}`}>
                  <th scope="row" className={`${td} font-normal ${f === nearest ? '' : 'text-ink-muted'}`}>固定 {Math.round(f.weight * 100)}% TQQQ{f === nearest ? ' · 回撤最接近' : ''}</th>
                  {metricsCells(f.segments.post2010)}
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        <div>
          <h3 className="mb-4 text-[13px] font-medium text-ink">标普 500：{segmentLabel(a, 'full')}</h3>
          <Table caption="三门在标普 500 上的跨资产检验">
            <thead><tr className="border-b border-edge"><th scope="col" className={th}>规则</th><th scope="col" className={thNum}>年化</th><th scope="col" className={thNum}>回撤</th><th scope="col" className={thNum}>Sharpe</th></tr></thead>
            <tbody>
              <tr className="border-b border-edge"><th scope="row" className={`${td} font-normal`}>三门 · 作者参数</th>{metricsCells(sp.authorParams.full)}</tr>
              <tr className="border-b border-edge"><th scope="row" className={`${td} font-normal`}>三门 · 网格中位</th><td className={tdNum}>{pct(sp.grid.full.cagrMedian)}</td><td className={tdNum}>{pct(sp.grid.full.drawdownMedian)}</td><td className={tdNum}>{num(sp.grid.full.sharpeMedian)}</td></tr>
              <tr className="border-b border-edge text-ink-muted"><th scope="row" className={`${td} font-normal text-ink-muted`}>持有 1 倍标普</th>{metricsCells(sp.hold1x.full)}</tr>
              <tr className="border-b border-edge text-ink-muted"><th scope="row" className={`${td} font-normal text-ink-muted`}>持有 3 倍标普</th>{metricsCells(sp.hold3x.full)}</tr>
            </tbody>
          </Table>
        </div>
      </div>
    </RunSection>
  )
}
