import { useLayoutEffect, useRef, useState } from 'react'
import { CHART_COLORS } from '../../charts/theme'
import type { Quantiles } from '../types'
import { num, pct, share } from './format'

export type StripMetric = 'maxDrawdown' | 'cagr' | 'sharpe'

export interface StripRow {
  id: string
  label: string
  color: string
  values: ArrayLike<number>
  actual: number | null
  q: Quantiles | null
  /** 真实历史比多少比例的世界好 */
  percentile: number | null
}

const ROW_H = 34
const PAD_X = 6

function domainFor(metric: StripMetric, rows: StripRow[]): [number, number] {
  if (metric === 'maxDrawdown') return [-1, 0]
  let lo = Infinity, hi = -Infinity
  for (const r of rows) {
    const qs = r.q ? [r.q.p05, r.q.p95] : []
    for (const v of [...qs, ...(r.actual !== null ? [r.actual] : [])]) { lo = Math.min(lo, v); hi = Math.max(hi, v) }
  }
  if (!Number.isFinite(lo)) return metric === 'cagr' ? [-0.1, 0.4] : [0, 1.2]
  const step = metric === 'cagr' ? 0.1 : 0.25
  const pad = (hi - lo) * 0.15 + step * 0.2
  return [Math.floor((lo - pad) / step) * step, Math.ceil((hi + pad) / step) * step]
}

function ticks(metric: StripMetric, [lo, hi]: [number, number]): number[] {
  const step = metric === 'maxDrawdown' ? 0.25 : metric === 'cagr' ? (hi - lo > 0.6 ? 0.2 : 0.1) : 0.25
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000)
  return out
}

const fmt = (metric: StripMetric, v: number) => (metric === 'sharpe' ? num(v, 2) : pct(v, metric === 'cagr' ? 1 : 0))

function Row({ row, metric, domain, density }: { row: StripRow; metric: StripMetric; domain: [number, number]; density: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useLayoutEffect(() => {
    const el = canvas.current
    if (!el) return
    const draw = () => {
      const rect = el.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      el.width = Math.round(rect.width * dpr)
      el.height = Math.round(rect.height * dpr)
      const ctx = el.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, rect.width, rect.height)
      const w = rect.width - PAD_X * 2
      const mid = rect.height / 2
      const x = (v: number) => PAD_X + ((Math.max(domain[0], Math.min(domain[1], v)) - domain[0]) / (domain[1] - domain[0])) * w
      ctx.fillStyle = CHART_COLORS.edge
      ctx.fillRect(PAD_X, Math.round(mid), w, 1)
      ctx.fillStyle = `rgba(171, 171, 171, ${density})`
      for (let k = 0; k < row.values.length; k++) ctx.fillRect(Math.round(x(row.values[k])), mid - 7, 1, 14)
      if (row.q) {
        ctx.fillStyle = CHART_COLORS.ink
        ctx.fillRect(x(row.q.p05), mid - 0.5, x(row.q.p95) - x(row.q.p05), 1)
        ctx.fillRect(x(row.q.p25), mid - 2, x(row.q.p75) - x(row.q.p25), 4)
        ctx.fillRect(Math.round(x(row.q.p50)) - 1, mid - 9, 2, 18)
      }
      if (row.actual !== null) {
        const ax = x(row.actual)
        const diamond = (r: number) => { ctx.beginPath(); ctx.moveTo(ax, mid - r); ctx.lineTo(ax + r, mid); ctx.lineTo(ax, mid + r); ctx.lineTo(ax - r, mid); ctx.closePath(); ctx.fill() }
        ctx.fillStyle = CHART_COLORS.surface
        diamond(8)
        ctx.fillStyle = row.color
        diamond(6)
      }
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(el)
    return () => observer.disconnect()
  }, [row, domain, density, metric])
  return <canvas ref={canvas} className="block h-full w-full" />
}

/** 每条规则一行:灰色细刻度是各平行世界,墨色是 5–95% 与 25–75% 区间和中位,规则色菱形是真实历史 */
export function StripChart({ rows, metric, worlds }: { rows: StripRow[]; metric: StripMetric; worlds: number }) {
  const domain = domainFor(metric, rows)
  const density = Math.min(0.5, Math.max(0.06, 6 / Math.sqrt(Math.max(1, worlds))))
  const [hover, setHover] = useState<string | null>(null)
  const axis = ticks(metric, domain)
  const pos = (v: number) => `calc(${PAD_X}px + ${((v - domain[0]) / (domain[1] - domain[0])) * 100}% - ${((v - domain[0]) / (domain[1] - domain[0])) * PAD_X * 2}px)`
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 md:grid-cols-[200px_minmax(0,1fr)_150px]">
      {rows.map((row) => (
        <div
          key={row.id}
          className={`contents ${hover && hover !== row.id ? '[&>*]:opacity-35' : ''}`}
          onPointerEnter={() => setHover(row.id)}
          onPointerLeave={() => setHover(null)}
        >
          <div className="flex items-center gap-2 pt-2 text-[12px] text-ink transition-opacity md:pt-0">
            <span aria-hidden className="h-[2px] w-3 shrink-0" style={{ background: row.color }} />
            <span className="truncate">{row.label}</span>
          </div>
          <div className="transition-opacity" style={{ height: ROW_H }}><Row row={row} metric={metric} domain={domain} density={density} /></div>
          <div className="num flex items-baseline gap-3 pb-2 text-[11px] text-ink-muted transition-opacity md:justify-end md:self-center md:pb-0">
            {row.q && <span>中位 <span className="text-ink">{fmt(metric, row.q.p50)}</span></span>}
            {row.actual !== null && <span>真实 <span className="text-ink">{fmt(metric, row.actual)}</span></span>}
            {row.percentile !== null && <span title="真实历史比多少比例的平行世界好">{share(row.percentile)}</span>}
          </div>
        </div>
      ))}
      <div className="hidden md:block" />
      <div className="relative h-6">
        {axis.map((v) => (
          <span key={v} className="num absolute top-1.5 -translate-x-1/2 text-[10px] text-ink-faint" style={{ left: pos(v) }}>{fmt(metric, v)}</span>
        ))}
      </div>
      <div className="hidden md:block" />
      <div className="sr-only"><table>
        <caption>各规则在平行世界中的分布</caption>
        <thead><tr><th>规则</th><th>5%</th><th>25%</th><th>中位</th><th>75%</th><th>95%</th><th>真实历史</th></tr></thead>
        <tbody>
          {rows.map((r) => <tr key={r.id}><th>{r.label}</th>{r.q ? [r.q.p05, r.q.p25, r.q.p50, r.q.p75, r.q.p95].map((v, i) => <td key={i}>{fmt(metric, v)}</td>) : <td colSpan={5}>—</td>}<td>{r.actual !== null ? fmt(metric, r.actual) : '—'}</td></tr>)}
        </tbody>
      </table></div>
    </div>
  )
}
