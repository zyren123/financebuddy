import { useLayoutEffect, useRef } from 'react'
import { createSpring } from '../motion/spring'

/** 带符号的百分比读数，使用真正的减号。 */
export function formatSigned(v: number, digits = 2): string {
  const s = Math.abs(v).toFixed(digits)
  return v < 0 ? `−${s}` : v > 0 ? `+${s}` : s
}

export function CountUp({ value, run, delay = 0, digits = 2 }: {
  value: number; run: boolean; delay?: number; digits?: number
}) {
  const element = useRef<HTMLSpanElement>(null)
  const spring = useRef<ReturnType<typeof createSpring> | null>(null)
  const started = useRef(false)
  useLayoutEffect(() => {
    const el = element.current
    if (!el) return
    spring.current = createSpring([0], ([shown]) => { el.textContent = formatSigned(shown, digits) })
    return () => { spring.current?.stop(); spring.current = null; started.current = false }
  }, [digits])
  useLayoutEffect(() => {
    if (!run) { spring.current?.set([0]); started.current = false; return }
    if (started.current || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      spring.current?.set([value])
      return
    }
    const timer = window.setTimeout(() => {
      started.current = true
      spring.current?.set([value])
    }, delay)
    return () => clearTimeout(timer)
  }, [value, run, delay, digits])
  return <span aria-label={formatSigned(value, digits)} ref={element}>{formatSigned(value, digits)}</span>
}
