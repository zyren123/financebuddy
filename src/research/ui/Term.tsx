import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { GLOSSARY } from './glossary'
import type { GlossaryKey } from './glossary'

const POPOVER_WIDTH = 300

/** 行内术语:悬停或点按展开通俗解释,Escape 或点别处收起 */
export function Term({ k, children }: { k: GlossaryKey; children?: ReactNode }) {
  const entry = GLOSSARY[k]
  const id = useId()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const anchor = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLSpanElement>(null)
  const hoverTimer = useRef(0)

  const place = useCallback(() => {
    const el = anchor.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const width = Math.min(POPOVER_WIDTH, window.innerWidth - 32)
    const left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16))
    setPos({ left, top: rect.bottom + 8 })
  }, [])

  useLayoutEffect(() => { if (open) place() }, [open, place])

  useEffect(() => {
    if (!open) return
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return
      if (event instanceof PointerEvent && event.target instanceof Node && (anchor.current?.contains(event.target) || panel.current?.contains(event.target))) return
      setOpen(false)
    }
    const onScroll = () => setOpen(false)
    document.addEventListener('keydown', close)
    document.addEventListener('pointerdown', close)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('keydown', close)
      document.removeEventListener('pointerdown', close)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  const hover = (next: boolean) => (event: ReactPointerEvent) => {
    if (event.pointerType !== 'mouse') return
    clearTimeout(hoverTimer.current)
    hoverTimer.current = window.setTimeout(() => setOpen(next), next ? 160 : 120)
  }

  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        onPointerEnter={hover(true)}
        onPointerLeave={hover(false)}
        className="inline text-left text-inherit underline decoration-field decoration-dotted underline-offset-[5px] transition-[text-decoration-color] hover:decoration-copper"
      >
        {children ?? entry.term}
      </button>
      {open && pos && (
        <span
          ref={panel}
          id={id}
          role="note"
          onPointerEnter={hover(true)}
          onPointerLeave={hover(false)}
          className="term-pop fixed z-40 block border border-edge border-t-copper bg-void-raised px-4 py-3 text-left"
          style={{ left: pos.left, top: pos.top, width: Math.min(POPOVER_WIDTH, window.innerWidth - 32) }}
        >
          <span className="block text-[12px] font-medium text-ink">{entry.term}</span>
          <span className="mt-1.5 block text-[13px] font-normal leading-relaxed text-ink-muted">{entry.body}</span>
        </span>
      )}
    </>
  )
}
