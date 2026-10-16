import { useRef } from 'react'
import { RANGE_OPTIONS } from '../charts/convert'
import type { RangeKey } from '../charts/convert'
import { SelectionIndicator } from '../motion/SelectionIndicator'

export function RangeTabs({ value, onChange }: { value: RangeKey; onChange: (key: RangeKey) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  return <div ref={ref} className="num relative flex text-[11px]" role="group" aria-label="时间区间">
    <SelectionIndicator container={ref} selected={value} />
    {RANGE_OPTIONS.map((opt) => <button key={opt.key} type="button" aria-pressed={value === opt.key} className={`border-b border-transparent px-1.5 py-1 transition-colors duration-150 ${value === opt.key ? 'text-ink' : 'text-ink-faint hover:text-ink-muted'}`} onClick={() => onChange(opt.key)}>{opt.label}</button>)}
  </div>
}
