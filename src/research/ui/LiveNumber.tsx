import { useLayoutEffect, useRef } from 'react'
import { createSpring, springs } from '../../motion/spring'

/** 读数随世界数增加收敛:数值经弹簧过渡,宽度靠等宽数字保持不跳 */
export function LiveNumber({ value, format, className }: { value: number | null; format: (v: number) => string; className?: string }) {
  const el = useRef<HTMLSpanElement>(null)
  const spring = useRef<ReturnType<typeof createSpring> | null>(null)
  const fmt = useRef(format)
  fmt.current = format
  useLayoutEffect(() => {
    const node = el.current
    if (!node) return
    if (value === null) { spring.current?.stop(); spring.current = null; node.textContent = '—'; return }
    if (!spring.current) {
      spring.current = createSpring([value], ([v]) => { node.textContent = fmt.current(v) }, springs.morph)
      node.textContent = fmt.current(value)
    }
    spring.current.set([value])
  }, [value])
  useLayoutEffect(() => () => { spring.current?.stop(); spring.current = null }, [])
  // 文字由 effect 直接写入,React 不渲染子节点,避免和弹簧逐帧写入冲突
  return <span ref={el} className={className} aria-label={value === null ? '暂无' : format(value)} />
}
