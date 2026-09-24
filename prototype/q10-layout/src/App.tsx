// Q10 布局原型:同一组卡片在三种布局下切换(?layout=a|b|c)
import { useEffect, useState } from 'react'
import BottomBar from './BottomBar'
import VariantA from './layouts/VariantA'
import VariantB from './layouts/VariantB'
import VariantC from './layouts/VariantC'

const KEYS = ['a', 'b', 'c'] as const
export type LayoutKey = (typeof KEYS)[number]

function currentFromUrl(): LayoutKey {
  const v = new URLSearchParams(location.search).get('layout')
  return KEYS.includes(v as LayoutKey) ? (v as LayoutKey) : 'a'
}

export default function App() {
  const [layout, setLayout] = useState<LayoutKey>(currentFromUrl)
  const [stateText, setStateText] = useState('')

  const select = (k: LayoutKey) => {
    const u = new URL(location.href)
    u.searchParams.set('layout', k)
    history.replaceState(null, '', u) // 变体可分享、刷新稳定
    setLayout(k)
    setStateText('')
  }

  useEffect(() => {
    const h = () => setLayout(currentFromUrl())
    window.addEventListener('popstate', h)
    return () => window.removeEventListener('popstate', h)
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo">
          <span className="logo-mark" />
          FinanceBuddy
        </div>
        <span className="proto-chip">Q10 布局原型 · 抛弃式</span>
        <span className="mock-note">mock 数据 · 不请求 Twelve Data · 不消耗 credits</span>
      </header>
      <main className="app-main">
        {layout === 'a' && <VariantA onState={setStateText} />}
        {layout === 'b' && <VariantB onState={setStateText} />}
        {layout === 'c' && <VariantC onState={setStateText} />}
      </main>
      <BottomBar current={layout} onSelect={select} stateText={stateText} />
    </div>
  )
}
