import { useMemo } from 'react'
import { CHART_COLORS } from '../charts/theme'
import type { RatioReading } from '../data/useRatioReadings'
import { formatSigned } from '../ui/CountUp'
import { CENTER, INNER, OUTER, VIEW, emitAngle, ringScale, track } from './geometry'

const STAGGER_MS = 260
const FIRE_DELAY_MS = 180

interface Props {
  readings: RatioReading[]
  /** 数据到齐后为 true:顶点闪光、径迹依次卷出 */
  fired: boolean
  active: number | null
  onActive?: (i: number | null) => void
  /** 页头徽记用的精简版:只留环与径迹 */
  compact?: boolean
  className?: string
}

/** 每条径迹开始卷出的时刻(ms),封面读数的滚动与之同步 */
export const trackDelay = (i: number) => FIRE_DELAY_MS + i * STAGGER_MS

/**
 * 对撞机事例显示:顶点 = ROC 的 0;每一环一档,径迹终点打在 |ROC| 对应的环上;
 * 负值(成长跑赢)顺时针卷,正值逆时针卷;虚线幽灵径迹是 N 个交易日前的位置。
 */
export function Detector({ readings, fired, active, onActive, compact = false, className }: Props) {
  const { step, rings } = useMemo(
    () => ringScale(readings.flatMap((r) => [r.value, r.previous ?? 0])),
    [readings],
  )
  const ringRadii = Array.from({ length: rings }, (_, k) => INNER + ((k + 1) / rings) * (OUTER - INNER))
  const tracks = readings.map((r, i) => {
    const emit = emitAngle(i, readings.length)
    return {
      now: track(r.value, emit, step, rings),
      ghost: r.previous != null ? track(r.previous, emit, step, rings) : null,
    }
  })
  const copper = CHART_COLORS.copper
  const hair = compact ? 6 : 1.25

  const summary = readings.map((r) => `${r.label} ${formatSigned(r.value)}%`).join(',')

  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      className={`${fired ? 'fired' : ''} ${className ?? ''}`}
      role={compact ? undefined : 'img'}
      aria-hidden={compact || undefined}
      aria-label={compact ? undefined : `探测器读数:${summary || '取数中'}。每环 ${step}%`}
      onPointerLeave={() => onActive?.(null)}
    >
      {/* 外层 μ 子室:虚线 + 刻度,纯结构 */}
      <circle cx={CENTER} cy={CENTER} r={OUTER + 52} fill="none" stroke={copper} strokeOpacity={0.28} strokeWidth={hair} strokeDasharray={compact ? undefined : '2 9'} />
      {!compact &&
        Array.from({ length: 72 }, (_, k) => {
          const a = (k / 72) * Math.PI * 2
          const r1 = OUTER + 52
          const r2 = r1 + (k % 6 === 0 ? 16 : 7)
          return (
            <line
              key={k}
              x1={CENTER + r1 * Math.cos(a)}
              y1={CENTER + r1 * Math.sin(a)}
              x2={CENTER + r2 * Math.cos(a)}
              y2={CENTER + r2 * Math.sin(a)}
              stroke={copper}
              strokeOpacity={0.35}
              strokeWidth={1}
            />
          )
        })}

      {/* 探测环:每环一档 */}
      {ringRadii.map((r, k) => (
        <circle
          key={r}
          cx={CENTER}
          cy={CENTER}
          r={r}
          fill="none"
          stroke={copper}
          strokeOpacity={k === rings - 1 ? 0.55 : 0.3}
          strokeWidth={hair}
        />
      ))}
      {!compact &&
        ringRadii.map((r, k) => (
          <text
            key={`l${r}`}
            x={CENTER + 8}
            y={CENTER - r - 8}
            fill={CHART_COLORS.muted}
            fontSize={19}
            fontFamily="var(--font-mono)"
          >
            {(step * (k + 1)).toLocaleString('zh-CN')}%
          </text>
        ))}

      {/* 束流管与顶点 */}
      {!compact && (
        <g stroke={copper} strokeOpacity={0.5} strokeWidth={1}>
          <line x1={CENTER - 22} y1={CENTER} x2={CENTER + 22} y2={CENTER} />
          <line x1={CENTER} y1={CENTER - 22} x2={CENTER} y2={CENTER + 22} />
        </g>
      )}
      <circle className="vertex-flash" cx={CENTER} cy={CENTER} r={20} fill={CHART_COLORS.ink} />
      <circle cx={CENTER} cy={CENTER} r={compact ? 22 : 5} fill={CHART_COLORS.ink} />

      {/* 幽灵径迹:N 个交易日前 */}
      {!compact &&
        tracks.map(
          (t, i) =>
            t.ghost && (
              <path
                key={`g${i}`}
                d={t.ghost.d}
                fill="none"
                stroke={CHART_COLORS.series[i]}
                strokeOpacity={active == null || active === i ? 0.45 : 0.08}
                strokeWidth={1.5}
                strokeDasharray="3 7"
              />
            ),
        )}

      {/* 径迹 */}
      {tracks.map((t, i) => {
        const color = CHART_COLORS.series[i]
        const dim = active != null && active !== i
        return (
          <g key={readings[i]!.label} style={{ opacity: dim ? 0.18 : 1, transition: 'opacity .3s ease' }}>
            <path
              className="track"
              d={t.now.d}
              pathLength={1}
              fill="none"
              stroke={color}
              strokeWidth={compact ? 28 : 3.5}
              strokeLinecap="round"
              style={{ transitionDelay: `${trackDelay(i)}ms` }}
            />
            {!compact && (
              <g className="hit" style={{ animationDelay: `${trackDelay(i) + 700}ms` }}>
                <circle cx={t.now.end.x} cy={t.now.end.y} r={9} fill={color} />
                <circle cx={t.now.end.x} cy={t.now.end.y} r={22} fill="none" stroke={color} strokeOpacity={0.6} strokeWidth={1.5} />
              </g>
            )}
            {!compact && (
              <text
                className="hit"
                style={{ animationDelay: `${trackDelay(i) + 760}ms` }}
                x={t.now.end.x + Math.cos(t.now.angle) * 40}
                y={t.now.end.y + Math.sin(t.now.angle) * 40 + 8}
                textAnchor={Math.cos(t.now.angle) > 0.25 ? 'start' : Math.cos(t.now.angle) < -0.25 ? 'end' : 'middle'}
                fill={CHART_COLORS.ink}
                fontSize={24}
                fontFamily="var(--font-mono)"
              >
                {readings[i]!.label}
              </text>
            )}
            {onActive && (
              // 命中区比径迹粗得多,悬停 / 点按都能选中
              <path
                d={t.now.d}
                fill="none"
                stroke="transparent"
                strokeWidth={48}
                onPointerEnter={() => onActive(i)}
                onClick={() => onActive(active === i ? null : i)}
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}
