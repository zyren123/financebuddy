import { useEffect } from 'react'
import { createSpring, springs } from './spring'

export function usePressFeedback() {
  useEffect(() => {
    const controls = new Map<HTMLElement, ReturnType<typeof createSpring>>()
    const pressed = new Set<HTMLElement>()
    const release = () => {
      for (const el of pressed) controls.get(el)?.set([1])
      pressed.clear()
    }
    const press = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && (event.repeat || !['Enter', ' '].includes(event.key))) return
      if (event instanceof PointerEvent && event.button !== 0) return
      const el = event.target instanceof Element ? event.target.closest('button:not(:disabled), a[href="#top"]') : null
      if (!(el instanceof HTMLElement)) return
      let spring = controls.get(el)
      if (!spring) {
        spring = createSpring([1], ([scale]) => { el.style.scale = String(scale) }, springs.feedback)
        controls.set(el, spring)
      }
      pressed.add(el)
      spring.set([0.975])
    }
    const onKeyUp = (event: KeyboardEvent) => { if (['Enter', ' '].includes(event.key)) release() }
    // Removed controls must not retain spring listeners after editing or changing tabs.
    const observer = new MutationObserver(() => {
      for (const [el, spring] of controls) {
        if (!el.isConnected) { spring.stop(); controls.delete(el); pressed.delete(el) }
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    document.addEventListener('pointerdown', press)
    document.addEventListener('keydown', press)
    document.addEventListener('pointerup', release)
    document.addEventListener('pointercancel', release)
    document.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', release)
    return () => {
      observer.disconnect()
      document.removeEventListener('pointerdown', press)
      document.removeEventListener('keydown', press)
      document.removeEventListener('pointerup', release)
      document.removeEventListener('pointercancel', release)
      document.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', release)
      for (const spring of controls.values()) spring.stop()
    }
  }, [])
}
