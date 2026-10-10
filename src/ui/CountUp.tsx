import { useEffect, useRef, useState } from 'react'

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** 带符号的百分比读数(用真正的减号,等宽字下与加号同宽) */
export function formatSigned(v: number, digits = 2): string {
  const s = Math.abs(v).toFixed(digits)
  return v < 0 ? `−${s}` : v > 0 ? `+${s}` : s
}

/**
 * 读数从 0 滚到目标值,与径迹卷出同步(指数缓出)。
 * run=false 时停在 0;减少动态偏好下直接显示终值。
 */
export function CountUp({
  value,
  run,
  delay = 0,
  duration = 1100,
  digits = 2,
}: {
  value: number
  run: boolean
  delay?: number
  duration?: number
  digits?: number
}) {
  const [shown, setShown] = useState(0)
  const raf = useRef(0)

  useEffect(() => {
    if (!run) return
    if (reducedMotion()) {
      setShown(value)
      return
    }
    const start = performance.now() + delay
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration))
      const eased = 1 - Math.pow(2, -10 * t)
      setShown(value * (t >= 1 ? 1 : eased))
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [value, run, delay, duration])

  return <>{formatSigned(shown, digits)}</>
}
