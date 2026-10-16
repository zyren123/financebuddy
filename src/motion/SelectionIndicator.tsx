import { useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { springs } from './spring'
import { useSpring } from './useSpring'

export function SelectionIndicator({ container, selected }: { container: RefObject<HTMLDivElement | null>; selected: string }) {
  const line = useRef<HTMLSpanElement>(null)
  const [bounds, setBounds] = useState([0, 0])
  const measured = useRef(false)
  useLayoutEffect(() => {
    const el = container.current
    if (!el) return
    let disposed = false
    const measure = () => {
      if (disposed) return
      const active = el.querySelector<HTMLElement>('[aria-selected="true"], [aria-pressed="true"]')
      if (!active) return
      setBounds([active.offsetLeft, active.offsetWidth])
      measured.current = true
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    void document.fonts.ready.then(measure)
    return () => { disposed = true; observer.disconnect() }
  }, [container, selected])
  useSpring(bounds, ([x, width]) => {
    if (!line.current) return
    line.current.style.transform = `translate3d(${x}px,0,0) scaleX(${width})`
    line.current.style.visibility = measured.current ? 'visible' : 'hidden'
  }, springs.selection)
  return <span ref={line} aria-hidden className="selection-indicator" />
}
