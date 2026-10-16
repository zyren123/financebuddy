import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { CHART_COLORS } from '../charts/theme'
import type { RatioReading } from '../data/useRatioReadings'
import { springs } from '../motion/spring'
import { useSpring } from '../motion/useSpring'
import { formatSigned } from '../ui/CountUp'
import { useMediaQuery } from '../ui/useMediaQuery'
import { CENTER, INNER, OUTER, VIEW, curvePath, emitAngle, readoutOutline, ringScale, trackCoordinates } from './geometry'

export const trackDelay = (i: number) => 120 + i * 105
const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

interface Props {
  readings: RatioReading[]
  fired: boolean
  active: number | null
  onActive: (i: number | null) => void
  period?: number
  className?: string
}

function Ring({ radius, label, outer, index, visible }: { radius: number; label: number; outer: boolean; index: number; visible: boolean }) {
  const circle = useRef<SVGCircleElement>(null)
  const text = useRef<SVGTextElement>(null)
  const group = useRef<SVGGElement>(null)
  useSpring([radius, outer ? 0.55 : 0.3, visible ? 1 : 0], ([r, stroke, opacity]) => {
    circle.current?.setAttribute('r', String(r))
    circle.current?.setAttribute('stroke-opacity', String(stroke))
    group.current?.setAttribute('opacity', String(clamp01(opacity)))
    text.current?.setAttribute('y', String(CENTER - r - 8))
  })
  return <g ref={group}>
    <circle ref={circle} className="detector-ring" cx={CENTER} cy={CENTER} r={radius} pathLength={1} fill="none" stroke={CHART_COLORS.copper} strokeOpacity={outer ? 0.55 : 0.3} strokeWidth={1.25} style={{ animationDelay: `${index * 35}ms` }} />
    <text className="detector-details" ref={text} x={CENTER + 8} y={CENTER - radius - 8} fill={CHART_COLORS.muted} fontSize={19} fontFamily="var(--font-mono)">{label.toLocaleString('zh-CN')}%</text>
  </g>
}

type Gesture = { kind: 'idle' } | { kind: 'cancelled' } | { kind: 'tracking'; id: number; x: number; y: number; pointerType: string }

function DetectorTrack({ reading, index, count, step, rings, active, onActive, period }: {
  reading: RatioReading; index: number; count: number; step: number; rings: number
  active: number | null; onActive: Props['onActive']; period: number
}) {
  const path = useRef<SVGPathElement>(null)
  const ghost = useRef<SVGPathElement>(null)
  const hitArea = useRef<SVGPathElement>(null)
  const nodeArea = useRef<SVGCircleElement>(null)
  const node = useRef<SVGCircleElement>(null)
  const shell = useRef<SVGPathElement>(null)
  const panel = useRef<SVGGElement>(null)
  const label = useRef<SVGTextElement>(null)
  const labelWidth = useRef(0)
  const group = useRef<SVGGElement>(null)
  const [pressed, setPressed] = useState(false)
  const gesture = useRef<Gesture>({ kind: 'idle' })
  const emit = emitAngle(index, count)
  const coords = trackCoordinates(reading.value, emit, step, rings)
  const previous = trackCoordinates(reading.previous ?? reading.value, emit, step, rings)
  const color = CHART_COLORS.series[index]
  const selected = active === index
  const narrow = useMediaQuery('(max-width: 767px)')
  const panelScale = narrow ? 1.65 : 1
  const width = 270 * panelScale
  const height = 122 * panelScale
  const panelX = Math.max(35, Math.min(VIEW - width - 35, coords[4] + (coords[4] < CENTER ? -width - 14 : 34)))
  const panelY = Math.max(35, Math.min(VIEW - height - 35, coords[5] - height / 2))
  const direction = (coords[4] - CENTER) / Math.hypot(coords[4] - CENTER, coords[5] - CENTER)
  const anchor = direction > 0.25 ? 0 : direction < -0.25 ? 1 : 0.5
  const target = [...coords, ...previous, panelX, panelY, active != null && !selected ? 0.18 : 1, panelScale, anchor]
  const frame = useRef({ geometry: target, focus: selected ? 1 : 0, pressure: 0 })

  const paint = () => {
    const { geometry: v, focus, pressure } = frame.current
    const [,,,, x, y] = v
    const visibleFocus = clamp01(focus)
    const compression = 1 - pressure * 0.14
    path.current?.setAttribute('d', curvePath(v))
    path.current?.style.setProperty('--track-width', `${3.5 + visibleFocus * 1.25}px`)
    ghost.current?.setAttribute('d', curvePath(v.slice(6, 12)))
    hitArea.current?.setAttribute('d', curvePath(v))
    group.current?.style.setProperty('--series-opacity', String(clamp01(v[14])))
    node.current?.setAttribute('cx', String(x))
    node.current?.setAttribute('cy', String(y))
    node.current?.setAttribute('r', String((9 + focus * 3) * compression))
    nodeArea.current?.setAttribute('cx', String(x))
    nodeArea.current?.setAttribute('cy', String(y))
    const angle = Math.atan2(y - CENTER, x - CENTER)
    label.current?.setAttribute('x', String(x + Math.cos(angle) * 40 - v[16] * labelWidth.current))
    label.current?.setAttribute('y', String(y + Math.sin(angle) * 40 + 8))
    label.current?.setAttribute('opacity', String(1 - visibleFocus))
    // Opacity is bounded; the outline keeps the spring's small geometric overshoot.
    const scale = v[15]
    const shellWidth = (44 + (270 * scale - 44) * focus) * (1 - pressure * 0.025)
    const shellHeight = (44 + (122 * scale - 44) * focus) * (1 - pressure * 0.025)
    const sx = x + (v[12] - x + 135 * scale) * focus - shellWidth / 2
    const sy = y + (v[13] - y + 61 * scale) * focus - shellHeight / 2
    shell.current?.setAttribute('d', readoutOutline(sx, sy, shellWidth, shellHeight, 22 * (1 - focus)))
    shell.current?.setAttribute('fill-opacity', String(visibleFocus))
    panel.current?.setAttribute('transform', `translate(${sx + 16 * scale},${sy + 28 * scale}) scale(${scale})`)
    panel.current?.setAttribute('opacity', String(clamp01((focus - 0.65) / 0.35)))
  }
  useSpring(target, (v) => { frame.current.geometry = [...v]; paint() })
  useSpring([selected ? 1 : 0], ([focus]) => { frame.current.focus = focus; paint() }, springs.detector)
  useSpring([pressed ? 1 : 0], ([pressure]) => { frame.current.pressure = pressure; paint() }, springs.node)
  useLayoutEffect(() => {
    let disposed = false
    const measure = () => { labelWidth.current = label.current?.getComputedTextLength() ?? 0; paint() }
    measure()
    void document.fonts.ready.then(() => { if (!disposed) measure() })
    return () => { disposed = true }
  }, [])

  const activate = () => onActive(index)
  const toggle = () => onActive(selected ? null : index)
  const cancelPress = () => { gesture.current = { kind: 'cancelled' }; setPressed(false) }
  const pointerDown = (event: PointerEvent<SVGGElement>) => {
    if (!event.isPrimary || event.button !== 0) return
    gesture.current = { kind: 'tracking', id: event.pointerId, x: event.clientX, y: event.clientY, pointerType: event.pointerType }
    event.currentTarget.setPointerCapture(event.pointerId)
    setPressed(true)
  }
  const pointerMove = (event: PointerEvent<SVGGElement>) => {
    const g = gesture.current
    if (g.kind === 'tracking' && g.id === event.pointerId && Math.hypot(event.clientX - g.x, event.clientY - g.y) > 10) cancelPress()
  }
  const keyDown = (event: KeyboardEvent<SVGGElement>) => {
    if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
      event.preventDefault()
      setPressed(true)
      toggle()
    }
    if (event.key === 'Escape') { event.stopPropagation(); setPressed(false); onActive(null) }
  }
  return (
    <g ref={group} className="detector-series" data-series={reading.label}>
      {reading.previous != null && <path ref={ghost} className="detector-details" d={curvePath(previous)} fill="none" stroke={color} strokeOpacity={0.45} strokeWidth={1.5} strokeDasharray="3 7" />}
      <path ref={path} className="track" d={curvePath(coords)} pathLength={1} fill="none" stroke={color} strokeWidth={3.5} strokeLinecap="round" style={{ transitionDelay: `${trackDelay(index)}ms` }} />
      <g className="detector-details" pointerEvents="none"><g className="detector-arrival" style={{ animationDelay: `${trackDelay(index) + 390}ms` }}>
        <circle ref={node} cx={coords[4]} cy={coords[5]} r={9} fill={color} />
        <text ref={label} fill={CHART_COLORS.ink} fontSize={24} fontFamily="var(--font-mono)">{reading.label}</text>
        <path ref={shell} fill={CHART_COLORS.surface} fillOpacity={0} stroke={color} strokeOpacity={0.7} strokeWidth={1.5} />
        <g ref={panel} opacity={0} aria-hidden="true" fontFamily="var(--font-mono)">
          <text fill={CHART_COLORS.muted} fontSize={20}>{reading.label}</text>
          <text y={34} fill={CHART_COLORS.ink} fontSize={29}>{formatSigned(reading.value)}%</text>
          <text y={64} fill={CHART_COLORS.muted} fontSize={17}>{reading.date} 收盘</text>
          <text y={85} fill={CHART_COLORS.muted} fontSize={17}>{reading.previous == null ? '无历史读数' : `${period} 日前 ${formatSigned(reading.previous)}%`}</text>
        </g>
      </g></g>
      <g className="detector-control" role="button" tabIndex={0} aria-label={`${reading.label} ${formatSigned(reading.value)}%，${reading.date}收盘，查看读数`} aria-pressed={selected}
        onFocus={(e) => { if (e.currentTarget.matches(':focus-visible')) activate() }}
        onBlur={() => { setPressed(false); onActive(null) }}
        onPointerEnter={(e) => { if (e.pointerType !== 'touch') activate() }}
        onPointerLeave={(e) => { if (e.pointerType !== 'touch') onActive(null) }}
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={() => setPressed(false)}
        onPointerCancel={cancelPress} onLostPointerCapture={() => setPressed(false)}
        onClick={(e) => {
          const g = gesture.current
          if (e.detail === 0 || (g.kind === 'tracking' && g.pointerType === 'touch')) toggle()
          else if (g.kind !== 'cancelled') activate()
          gesture.current = { kind: 'idle' }
        }}
        onKeyDown={keyDown} onKeyUp={() => setPressed(false)}>
        <path ref={hitArea} d={curvePath(coords)} fill="none" stroke="transparent" strokeWidth={48} />
        <circle ref={nodeArea} cx={coords[4]} cy={coords[5]} r={narrow ? 72 : 44} fill="transparent" />
      </g>
    </g>
  )
}

export function Detector({ readings, fired, active, onActive, period = 35, className }: Props) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!fired) { setArmed(false); return }
    let id = requestAnimationFrame(() => { id = requestAnimationFrame(() => setArmed(true)) })
    return () => cancelAnimationFrame(id)
  }, [fired])
  const { step, rings } = useMemo(() => ringScale(readings.flatMap((r) => [r.value, r.previous ?? 0])), [readings])
  const summary = readings.map((r) => `${r.label} ${formatSigned(r.value)}%`).join(',')
  return (
    <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className={`detector ${armed ? 'fired' : ''} ${className ?? ''}`} role="group" aria-label={`探测器读数:${summary || '取数中'}。每环 ${step}%`} onPointerLeave={(e) => { if (e.pointerType !== 'touch') onActive(null) }} onKeyDown={(e) => { if (e.key === 'Escape') onActive(null) }}>
      <circle className="detector-perimeter" cx={CENTER} cy={CENTER} r={OUTER + 52} fill="none" stroke={CHART_COLORS.copper} strokeOpacity={0.28} strokeWidth={1.25} strokeDasharray="var(--detector-dash, 2 9)" />
      <g className="detector-hardware-detail">{Array.from({ length: 72 }, (_, k) => {
        const a = (k / 72) * Math.PI * 2
        const r1 = OUTER + 52
        const r2 = r1 + (k % 6 === 0 ? 16 : 7)
        return <line key={k} className="detector-tick" x1={CENTER + r1 * Math.cos(a)} y1={CENTER + r1 * Math.sin(a)} x2={CENTER + r2 * Math.cos(a)} y2={CENTER + r2 * Math.sin(a)} stroke={CHART_COLORS.copper} strokeOpacity={0.35} strokeWidth={1} style={{ animationDelay: `${k * 4}ms` }} />
      })}</g>
      {Array.from({ length: Math.max(6, rings) }, (_, k) => <Ring key={k} index={k} radius={INNER + (Math.min(k + 1, rings) / rings) * (OUTER - INNER)} label={step * (k + 1)} outer={k === rings - 1} visible={k < rings} />)}
      <g className="detector-hardware-detail" stroke={CHART_COLORS.copper} strokeOpacity={0.5} strokeWidth={1}>
        <line x1={CENTER - 22} y1={CENTER} x2={CENTER + 22} y2={CENTER} />
        <line x1={CENTER} y1={CENTER - 22} x2={CENTER} y2={CENTER + 22} />
      </g>
      <circle className="detector-vertex" cx={CENTER} cy={CENTER} r={5} fill={CHART_COLORS.ink} />
      {readings.map((reading, i) => <DetectorTrack key={reading.label} reading={reading} index={i} count={readings.length} step={step} rings={rings} active={active} onActive={onActive} period={period} />)}
    </svg>
  )
}
