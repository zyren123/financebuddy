import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

interface Refs {
  cover: RefObject<HTMLElement | null>
  detector: RefObject<HTMLDivElement | null>
  texts: Array<RefObject<HTMLDivElement | null>>
  /** 页头里的徽记槽位:探测器的落点 */
  emblem: RefObject<HTMLDivElement | null>
  header: RefObject<HTMLElement | null>
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/**
 * 封面 → 仪表盘的连续转场:滚动进度 p ∈ [0,1](封面滚出视口的比例)。
 * 同一个探测器节点按 p 缩放、平移,最后精确落进页头徽记;文字先上移淡出。
 * 只写 transform / opacity,每帧不读布局(自然位置在 resize 时量一次)。
 */
export function useCoverMorph({ cover, detector, texts, emblem, header }: Refs, ready: boolean) {
  const natural = useRef<{ left: number; top: number; size: number; emblemDX: number; emblemDY: number; emblemSize: number } | null>(null)

  useEffect(() => {
    const det = detector.current
    const em = emblem.current
    const hd = header.current
    const cv = cover.current
    if (!det || !em || !hd || !cv) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let headerDocTop = 0
    const measure = () => {
      const prev = det.style.transform
      det.style.transform = 'none'
      const d = det.getBoundingClientRect()
      const e = em.getBoundingClientRect()
      const h = hd.getBoundingClientRect()
      det.style.transform = prev
      // 吸顶元素的 rect 会被 sticky 改写,文档位置取它父容器的 offsetTop
      headerDocTop = (hd.parentElement?.offsetTop ?? 0) + hd.offsetTop
      natural.current = {
        left: d.left,
        top: d.top + window.scrollY,
        size: d.width,
        emblemDX: e.left - h.left,
        emblemDY: e.top - h.top,
        emblemSize: e.width,
      }
    }

    let frame = 0
    const apply = () => {
      frame = 0
      const n = natural.current
      if (!n) return
      const end = headerDocTop
      const p = clamp01(window.scrollY / Math.max(1, end))

      for (const t of texts) {
        const el = t.current
        if (!el) continue
        const tp = clamp01(p / 0.55)
        el.style.opacity = String(1 - tp)
        el.style.transform = reduced ? '' : `translate3d(0, ${-48 * tp}px, 0)`
      }

      // 落点:页头在文档中的位置是 end(封面高度);未吸顶前随页面滚动,吸顶后固定在视口顶
      const headerTop = Math.max(0, end - window.scrollY)
      const targetX = n.emblemDX + n.emblemSize / 2
      const targetY = headerTop + n.emblemDY + n.emblemSize / 2
      const startX = n.left + n.size / 2
      const startY = n.top - window.scrollY + n.size / 2

      if (reduced) {
        det.style.opacity = String(1 - clamp01(p / 0.6))
        em.style.opacity = p > 0.9 ? '1' : '0'
        return
      }

      // 前 15% 原地不动,让封面先被读完
      const m = easeInOut(clamp01((p - 0.15) / 0.85))
      const cx = startX + (targetX - startX) * m
      const cy = startY + (targetY - startY) * m
      const scale = 1 + (n.emblemSize / n.size - 1) * m
      // 自然位置随页面滚动上移了 scrollY,补回来再插值到落点
      det.style.transform = `translate3d(${cx - startX}px, ${cy - startY}px, 0) scale(${scale})`
      const landed = p >= 0.995
      det.style.opacity = landed ? '0' : '1'
      em.style.opacity = landed ? '1' : '0'
    }

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(apply)
    }
    const onResize = () => {
      measure()
      apply()
    }

    onResize()
    // 读数到齐、字体换入都会改封面高度:跟着重新量
    const ro = new ResizeObserver(onResize)
    ro.observe(cv)
    void document.fonts?.ready.then(onResize)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [cover, detector, texts, emblem, header, ready])
}
