import { useLayoutEffect } from 'react'
import type { RefObject } from 'react'
import { createSpring, springs } from '../motion/spring'
import { VIEW } from './geometry'

interface Refs {
  cover: RefObject<HTMLElement | null>
  origin: RefObject<HTMLDivElement | null>
  detector: RefObject<HTMLDivElement | null>
  texts: Array<RefObject<HTMLDivElement | null>>
  emblem: RefObject<HTMLDivElement | null>
  header: RefObject<HTMLElement | null>
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const easeInOut = (t: number) => t * t * (3 - 2 * t)

/** Both layout slots address one persistent SVG in viewport coordinates. */
export function useCoverMorph({ cover, origin, detector, texts, emblem, header }: Refs) {
  useLayoutEffect(() => {
    const det = detector.current
    const slot = origin.current
    const em = emblem.current
    const hd = header.current
    const cv = cover.current
    if (!det || !slot || !em || !hd || !cv) return
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    let layout = { left: 0, top: 0, size: 0, headerTop: 0, dockX: 0, dockY: 0, dockSize: 0 }
    let scene: ReturnType<typeof createSpring> | undefined
    let frame = 0
    let disposed = false

    const paint = ([cx, cy, size, weight]: readonly number[]) => {
      det.style.transform = `translate3d(${cx - VIEW / 2}px, ${cy - VIEW / 2}px, 0) scale(${size / VIEW})`
      det.style.setProperty('--detector-detail', String(1 - clamp01(weight / 0.75)))
      det.style.setProperty('--detector-weight', String(clamp01(weight)))
      det.style.setProperty('--detector-cover-stroke', String(layout.size / size * (1 - clamp01(weight))))
      det.style.setProperty('--detector-dock-stroke', String(layout.dockSize / size * clamp01(weight)))
      det.style.setProperty('--detector-dash', `${2 + 9 * clamp01(weight)} ${9 * (1 - clamp01(weight))}`)
      det.style.visibility = 'visible'
    }
    const apply = () => {
      frame = 0
      const n = layout
      const p = clamp01(window.scrollY / Math.max(1, n.headerTop))
      const m = easeInOut(clamp01((p - 0.15) / 0.85))
      const headerTop = Math.max(0, n.headerTop - window.scrollY)
      const startX = n.left + n.size / 2
      const startY = n.top - window.scrollY + n.size / 2
      const docked = p >= 1
      const weight = preference.matches ? (p > 0.9 ? 1 : 0) : m
      const pose = [
        startX + (n.dockX - startX) * weight,
        startY + (headerTop + n.dockY - startY) * weight,
        n.size + (n.dockSize - n.size) * weight,
        weight,
      ]
      det.inert = p > 0.55
      det.style.pointerEvents = p > 0.55 ? 'none' : ''
      det.setAttribute('aria-hidden', String(p > 0.55))
      det.dataset.scenePhase = docked ? 'docked' : p > 0 ? 'transit' : 'cover'
      det.style.opacity = String(preference.matches && weight === 0 ? 1 - clamp01(p / 0.6) : 1)
      if (!scene) {
        scene = createSpring(pose, paint, springs.spatial)
        paint(pose)
      } else scene.set(pose)
      for (const t of texts) {
        const el = t.current
        if (!el) continue
        const tp = clamp01(p / 0.55)
        el.style.opacity = String(1 - tp)
        el.style.transform = preference.matches ? '' : `translate3d(0, ${-48 * tp}px, 0)`
        el.inert = tp >= 1
      }
    }
    const measure = () => {
      const d = slot.getBoundingClientRect()
      const e = em.getBoundingClientRect()
      const h = hd.getBoundingClientRect()
      layout = {
        left: d.left,
        top: d.top + window.scrollY,
        size: d.width,
        headerTop: (hd.parentElement?.getBoundingClientRect().top ?? h.top) + window.scrollY,
        dockX: e.left + e.width / 2,
        dockY: e.top - h.top + e.height / 2,
        dockSize: e.width,
      }
      apply()
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(apply) }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(slot)
    observer.observe(cv)
    observer.observe(hd)
    void document.fonts.ready.then(() => { if (!disposed) measure() })
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure)
    preference.addEventListener('change', apply)
    return () => {
      disposed = true
      observer.disconnect()
      cancelAnimationFrame(frame)
      scene?.stop()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('resize', measure)
      preference.removeEventListener('change', apply)
    }
  }, [cover, origin, detector, texts, emblem, header])
}
