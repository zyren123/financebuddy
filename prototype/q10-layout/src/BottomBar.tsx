// 底部浮动切换条(UI 原型规范:←/→ 循环切换 + URL 参数 + 键盘 + 状态面板)
import { useEffect, useState } from 'react'
import type { LayoutKey } from './App'

export const VARIANT_META: Record<LayoutKey, { name: string; hint: string; tech: string }> = {
  a: {
    name: 'A · 可拖拽网格',
    hint: '拖卡片标题栏换位;拉右下角 / 右边缘 / 下边缘调宽高,其余卡片自动让位(类 Grafana)',
    tech: 'react-grid-layout',
  },
  b: {
    name: 'B · 自动流式',
    hint: '卡片按添加顺序自上而下、等宽全幅,零布局操作 —— 感受"什么都不用管"的基线',
    tech: '纯 CSS 流式',
  },
  c: {
    name: 'C · IDE 式停靠',
    hint: '拖标签页到任意方向分屏、拖进别的组变成标签页;组右上角菜单支持浮动窗口 / 弹出独立窗口(类 VS Code)',
    tech: 'dockview',
  },
}

const ORDER: LayoutKey[] = ['a', 'b', 'c']

export default function BottomBar({
  current,
  onSelect,
  stateText,
}: {
  current: LayoutKey
  onSelect: (k: LayoutKey) => void
  stateText: string
}) {
  const [open, setOpen] = useState(false)

  function cycle(d: number) {
    const i = ORDER.indexOf(current)
    onSelect(ORDER[(i + d + ORDER.length) % ORDER.length])
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'ArrowLeft') cycle(-1)
      if (e.key === 'ArrowRight') cycle(1)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  if (!import.meta.env.DEV) return null // 原型条不允许进入生产构建

  return (
    <>
      {open && (
        <div className="state-panel">
          <div className="state-head">当前布局状态(实时)</div>
          <pre>{stateText || '…'}</pre>
        </div>
      )}
      <div className="bottom-bar">
        <span className="proto-tag">PROTOTYPE</span>
        <button className="arrow" onClick={() => cycle(-1)} aria-label="上一个变体" title="←">
          ‹
        </button>
        <div className="bar-main">
          <div className="bar-name">
            {VARIANT_META[current].name} <span className="bar-tech">{VARIANT_META[current].tech}</span>
          </div>
          <div className="bar-hint">{VARIANT_META[current].hint}</div>
        </div>
        <button className="arrow" onClick={() => cycle(1)} aria-label="下一个变体" title="→">
          ›
        </button>
        <div className="bar-sep" />
        <button className={`state-btn ${open ? 'on' : ''}`} onClick={() => setOpen((o) => !o)}>
          状态
        </button>
      </div>
    </>
  )
}
