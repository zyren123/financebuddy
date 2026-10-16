import { useLayoutEffect, useRef } from 'react'
import { createSpring, springs } from './spring'
import type { SpringConfig } from './spring'

/** Animate DOM/SVG attributes without scheduling React renders. */
export function useSpring(target: readonly number[], paint: (value: readonly number[]) => void, config: SpringConfig = springs.morph) {
  const callback = useRef(paint)
  const spring = useRef<ReturnType<typeof createSpring> | null>(null)
  useLayoutEffect(() => {
    callback.current = paint
    if (!spring.current) {
      spring.current = createSpring(target, (value) => callback.current(value), config)
      paint(target)
    }
    spring.current.set(target)
  })
  useLayoutEffect(() => () => {
    spring.current?.stop()
    spring.current = null
  }, [])
}
