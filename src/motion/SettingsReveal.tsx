import { useRef } from 'react'
import type { ReactNode } from 'react'
import { useSpring } from './useSpring'

export function SettingsReveal({ open, children }: { open: boolean; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  useSpring([open ? 1 : 0], ([value]) => {
    const el = panel.current
    if (!el) return
    const p = Math.max(0, Math.min(1, value))
    el.style.clipPath = `inset(0 0 ${100 * (1 - p)}% ${100 * (1 - p)}%)`
    el.style.visibility = p < 0.001 ? 'hidden' : 'visible'
  })
  return <div ref={panel} className="absolute inset-0 z-10 bg-void-raised p-2" inert={!open} aria-hidden={!open} style={{ pointerEvents: open ? 'auto' : 'none' }}>{children}</div>
}
