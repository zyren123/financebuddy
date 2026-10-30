import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { CHART_COLORS, MONO_FONT } from '../../charts/theme'
import { money } from './format'

interface Props {
  /** 平行世界的 log10 净值路径;数组随批次增长,count 变化时增量绘制 */
  paths: Float32Array[]
  count: number
  /** 预期总世界数,用来固定径迹透明度,流入过程中亮度不跳 */
  expected: number
  actual: Float32Array | null
  dates: string[]
  color: string
  label: string
  complete: boolean
}

const M = { top: 14, right: 92, bottom: 26, left: 58 }
const DRAW_MS = 900

function quantileAt(paths: Float32Array[], i: number, qs: number[]): number[] {
  const values = new Float64Array(paths.length)
  for (let k = 0; k < paths.length; k++) values[k] = paths[k][i]
  values.sort()
  return qs.map((q) => {
    const pos = q * (values.length - 1)
    const lo = Math.floor(pos)
    const hi = Math.min(values.length - 1, lo + 1)
    return values[lo] + (values[hi] - values[lo]) * (pos - lo)
  })
}

/** 平行世界净值扇面:灰色细径迹是打乱后的历史,规则色粗径迹是真实历史 */
export function FanChart({ paths, count, expected, actual, dates, color, label, complete }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const base = useRef<HTMLCanvasElement>(null)
  const top = useRef<HTMLCanvasElement>(null)
  const drawn = useRef(0)
  const source = useRef<Float32Array[] | null>(null)
  const domain = useRef<[number, number] | null>(null)
  const size = useRef({ w: 0, h: 0, dpr: 1 })
  const progress = useRef(0)
  const bands = useRef<{ p05: Float32Array; p50: Float32Array; p95: Float32Array } | null>(null)
  const [hover, setHover] = useState<{ x: number; i: number } | null>(null)
  const [, setTick] = useState(0)

  const geometry = useCallback(() => {
    const { w, h } = size.current
    const [lo, hi] = domain.current ?? [-1, 1]
    const plotW = w - M.left - M.right
    const plotH = h - M.top - M.bottom
    const n = actual?.length ?? paths[0]?.length ?? 240
    return {
      plotW, plotH, n, lo, hi,
      x: (i: number) => M.left + (i / Math.max(1, n - 1)) * plotW,
      y: (v: number) => M.top + (1 - (v - lo) / (hi - lo)) * plotH,
    }
  }, [actual, paths])

  const extendDomain = useCallback((from: number) => {
    let lo = domain.current?.[0] ?? Infinity
    let hi = domain.current?.[1] ?? -Infinity
    const scan = (p: Float32Array) => { for (let i = 0; i < p.length; i++) { if (p[i] < lo) lo = p[i]; if (p[i] > hi) hi = p[i] } }
    if (actual) scan(actual)
    for (let k = from; k < paths.length; k++) scan(paths[k])
    if (!Number.isFinite(lo)) { lo = -1; hi = 1 }
    const next: [number, number] = [Math.floor(Math.min(lo, -0.3)), Math.ceil(Math.max(hi, 0.3))]
    const changed = !domain.current || next[0] !== domain.current[0] || next[1] !== domain.current[1]
    if (changed) domain.current = next
    return changed
  }, [actual, paths])

  const drawBase = useCallback((full: boolean) => {
    const canvas = base.current
    if (!canvas || size.current.w === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { dpr, w, h } = size.current
    const g = geometry()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (full) {
      ctx.clearRect(0, 0, w, h)
      drawn.current = 0
      ctx.font = `10px ${MONO_FONT}`
      ctx.textBaseline = 'middle'
      const decades = g.hi - g.lo
      const step = g.plotH / decades < 26 ? 2 : 1
      for (let d = g.lo; d <= g.hi; d++) {
        const yy = Math.round(g.y(d)) + 0.5
        ctx.strokeStyle = CHART_COLORS.grid
        ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(M.left, yy); ctx.lineTo(w - M.right, yy); ctx.stroke()
        if ((d - g.lo) % step === 0) {
          ctx.fillStyle = CHART_COLORS.muted
          ctx.textAlign = 'right'
          ctx.fillText(money(d).replace(/\.00$/, ''), M.left - 10, yy)
        }
      }
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      let lastYear = ''
      for (let i = 0; i < dates.length; i++) {
        const year = dates[i].slice(0, 4)
        if (year !== lastYear && Number(year) % 5 === 0) {
          ctx.fillStyle = CHART_COLORS.muted
          ctx.fillText(year, g.x(i), h - M.bottom + 9)
        }
        lastYear = year
      }
    }
    const alpha = Math.min(0.24, Math.max(0.035, 3.2 / Math.sqrt(Math.max(1, expected))))
    ctx.strokeStyle = `rgba(171, 171, 171, ${alpha})`
    ctx.lineWidth = 1
    ctx.lineJoin = 'round'
    ctx.save()
    ctx.beginPath(); ctx.rect(M.left, M.top - 2, g.plotW, g.plotH + 4); ctx.clip()
    for (let k = drawn.current; k < paths.length; k++) {
      const p = paths[k]
      ctx.beginPath()
      ctx.moveTo(g.x(0), g.y(p[0]))
      for (let i = 1; i < p.length; i++) ctx.lineTo(g.x(i), g.y(p[i]))
      ctx.stroke()
    }
    ctx.restore()
    drawn.current = paths.length
  }, [geometry, paths, dates, expected])

  const drawTop = useCallback(() => {
    const canvas = top.current
    if (!canvas || size.current.w === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { dpr, w, h } = size.current
    const g = geometry()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const zero = Math.round(g.y(0)) + 0.5
    ctx.strokeStyle = CHART_COLORS.copper
    ctx.lineWidth = 1
    ctx.setLineDash([3, 5])
    ctx.beginPath(); ctx.moveTo(M.left, zero); ctx.lineTo(w - M.right, zero); ctx.stroke()
    ctx.setLineDash([])
    const line = (p: Float32Array, upto: number) => {
      ctx.beginPath()
      ctx.moveTo(g.x(0), g.y(p[0]))
      const last = Math.max(1, Math.floor(upto * (p.length - 1)))
      for (let i = 1; i <= last; i++) ctx.lineTo(g.x(i), g.y(p[i]))
      ctx.stroke()
      return last
    }
    const b = bands.current
    if (b) {
      ctx.lineWidth = 1
      ctx.strokeStyle = CHART_COLORS.muted
      ctx.globalAlpha = 0.55
      line(b.p05, 1); line(b.p95, 1)
      ctx.globalAlpha = 1
      ctx.setLineDash([4, 4])
      ctx.lineWidth = 1.5
      ctx.strokeStyle = CHART_COLORS.ink
      line(b.p50, 1)
      ctx.setLineDash([])
    }
    ctx.font = `10px ${MONO_FONT}`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    const labels: { y: number; text: string; mark: 'dash' | 'track' }[] = []
    if (b) labels.push({ y: g.y(b.p50[b.p50.length - 1]), text: `中位 ${money(b.p50[b.p50.length - 1])}`, mark: 'dash' })
    if (actual && progress.current > 0) {
      ctx.strokeStyle = CHART_COLORS.surface
      ctx.lineWidth = 6
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      line(actual, progress.current)
      ctx.strokeStyle = color
      ctx.lineWidth = 2.5
      const last = line(actual, progress.current)
      ctx.fillStyle = color
      ctx.beginPath(); ctx.arc(g.x(last), g.y(actual[last]), 3.5, 0, Math.PI * 2); ctx.fill()
      if (progress.current >= 1) labels.push({ y: g.y(actual[actual.length - 1]), text: `真实 ${money(actual[actual.length - 1])}`, mark: 'track' })
    }
    labels.sort((a, c) => a.y - c.y)
    for (let k = 1; k < labels.length; k++) if (labels[k].y - labels[k - 1].y < 14) labels[k].y = labels[k - 1].y + 14
    for (const l of labels) {
      const x0 = w - M.right + 10
      if (l.mark === 'track') { ctx.fillStyle = color; ctx.fillRect(x0, l.y - 1, 10, 2) }
      else { ctx.fillStyle = CHART_COLORS.ink; ctx.fillRect(x0, l.y - 0.75, 4, 1.5); ctx.fillRect(x0 + 6, l.y - 0.75, 4, 1.5) }
      ctx.fillStyle = CHART_COLORS.ink
      ctx.fillText(l.text, x0 + 15, l.y)
    }
    if (hover) {
      const xx = Math.round(g.x(hover.i)) + 0.5
      ctx.strokeStyle = CHART_COLORS.crosshair
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(xx, M.top); ctx.lineTo(xx, h - M.bottom); ctx.stroke()
    }
  }, [geometry, actual, color, hover])

  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const resize = () => {
      const rect = el.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      size.current = { w: rect.width, h: rect.height, dpr }
      for (const c of [base.current, top.current]) {
        if (!c) continue
        c.width = Math.round(rect.width * dpr)
        c.height = Math.round(rect.height * dpr)
      }
      drawBase(true)
      drawTop()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(el)
    void document.fonts.ready.then(resize)
    return () => observer.disconnect()
  }, [drawBase, drawTop])

  useEffect(() => {
    if (source.current !== paths || paths.length < drawn.current) { source.current = paths; domain.current = null; drawn.current = 0 }
    const changed = extendDomain(drawn.current)
    drawBase(changed || drawn.current === 0)
    if (changed) drawTop()
  }, [count, paths, extendDomain, drawBase, drawTop])

  // 真实历史最后落定:扇面流入完成后,径迹从起点画到终点
  useEffect(() => {
    bands.current = null
    progress.current = 0
    if (!complete || !actual) { drawTop(); return }
    if (paths.length > 1) {
      const n = actual.length
      const p05 = new Float32Array(n), p50 = new Float32Array(n), p95 = new Float32Array(n)
      for (let i = 0; i < n; i++) [p05[i], p50[i], p95[i]] = quantileAt(paths, i, [0.05, 0.5, 0.95])
      bands.current = { p05, p50, p95 }
    }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { progress.current = 1; drawTop(); setTick((t) => t + 1); return }
    let frame = 0
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DRAW_MS)
      progress.current = 1 - (1 - t) ** 4
      drawTop()
      if (t < 1) frame = requestAnimationFrame(step)
      else setTick((v) => v + 1)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [complete, actual, paths, color, drawTop])

  useEffect(() => { drawTop() }, [hover, drawTop])

  const onMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const g = geometry()
    const rel = (event.clientX - rect.left - M.left) / g.plotW
    if (rel < 0 || rel > 1) { setHover(null); return }
    setHover({ x: event.clientX - rect.left, i: Math.round(rel * (g.n - 1)) })
  }

  let tip: { date: string; actual: number | null; q: number[] | null } | null = null
  if (hover && (actual || paths.length)) {
    tip = {
      date: dates[hover.i] ?? '',
      actual: actual && progress.current >= 1 ? actual[hover.i] : null,
      q: paths.length > 1 ? quantileAt(paths, hover.i, [0.05, 0.5, 0.95]) : null,
    }
  }
  const finalActual = actual ? actual[actual.length - 1] : null

  return (
    <div
      ref={wrap}
      className="chart-surface relative h-[300px] w-full select-none md:h-[340px]"
      onPointerMove={onMove}
      onPointerDown={onMove}
      onPointerLeave={() => setHover(null)}
      role="img"
      aria-label={`${label}：${count} 个平行世界的净值径迹${finalActual !== null ? `，真实历史期末 ${money(finalActual)}` : ''}`}
    >
      <canvas ref={base} className="absolute inset-0 h-full w-full" />
      <canvas ref={top} className="absolute inset-0 h-full w-full" />
      {tip && hover && (
        <div
          className="pointer-events-none absolute top-3 z-10 w-max border border-edge bg-void-raised px-3 py-2"
          style={{ left: hover.x > size.current.w / 2 ? hover.x - 12 : hover.x + 12, transform: hover.x > size.current.w / 2 ? 'translateX(-100%)' : undefined }}
        >
          <div className="num text-[11px] text-ink-faint">{tip.date}</div>
          {tip.actual !== null && <div className="num mt-1 flex items-center gap-2 text-[12px] text-ink"><span className="h-[2px] w-3" style={{ background: color }} />真实 {money(tip.actual)}</div>}
          {tip.q && <>
            <div className="num mt-1 text-[12px] text-ink">平行世界中位 {money(tip.q[1])}</div>
            <div className="num mt-0.5 text-[11px] text-ink-muted">5%–95% {money(tip.q[0])} – {money(tip.q[2])}</div>
          </>}
        </div>
      )}
    </div>
  )
}
