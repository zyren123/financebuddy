// Card 通用外壳:标题栏(兼作 A 布局的拖拽把手)+ 范围快捷切换 + 图表体
import type { ReactNode } from 'react'
import { RANGES, type RangeKey } from '../chart/chartBase'

export default function CardShell({
  title,
  subtitle,
  right,
  className,
  children,
}: {
  title: string
  subtitle?: string
  right?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`card ${className ?? ''}`}>
      <div className="card-head card-drag-handle">
        <div className="card-title">
          <span className="t">{title}</span>
          {subtitle && <span className="s">{subtitle}</span>}
        </div>
        {right}
      </div>
      <div className="card-body">{children}</div>
    </div>
  )
}

export function RangeButtons({ value, onChange }: { value: RangeKey; onChange: (r: RangeKey) => void }) {
  return (
    <div className="range-btns">
      {RANGES.map((r) => (
        <button key={r} className={r === value ? 'on' : ''} onClick={() => onChange(r)}>
          {r}
        </button>
      ))}
    </div>
  )
}
