// Q10 布局原型:同一组卡片在三种布局下切换(?layout=a|b|c)
import { useEffect, useState } from 'react'
import BottomBar from './BottomBar'
import VariantA, { type PresetKey } from './layouts/VariantA'
import VariantB from './layouts/VariantB'
import VariantC from './layouts/VariantC'

const KEYS = ['a', 'b', 'c'] as const
export type LayoutKey = (typeof KEYS)[number]

function currentFromUrl(): LayoutKey {
  const v = new URLSearchParams(location.search).get('layout')
  return KEYS.includes(v as LayoutKey) ? (v as LayoutKey) : 'a'
}

function presetFromUrl(): PresetKey {
  return new URLSearchParams(location.search).get('preset') === 'flow' ? 'flow' : 'quad'
}

export default function App() {
  const [layout, setLayout] = useState<LayoutKey>(currentFromUrl)
  const [preset, setPreset] = useState<PresetKey>(presetFromUrl)
  const [stateText, setStateText] = useState('')

  const setUrlParam = (key: string, value: string) => {
    const u = new URL(location.href)
    u.searchParams.set(key, value)
    history.replaceState(null, '', u) // 变体/预设可分享、刷新稳定
  }

  const select = (k: LayoutKey) => {
    setUrlParam('layout', k)
    setLayout(k)
    setStateText('')
  }

  const selectPreset = (p: PresetKey) => {
    setUrlParam('preset', p)
    setPreset(p)
    setStateText('')
  }

  useEffect(() => {
    const h = () => {
      setLayout(currentFromUrl())
      setPreset(presetFromUrl())
    }
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
        {layout === 'a' && (
          <div className="preset-picker" role="group" aria-label="A 布局预设">
            <span className="preset-label">默认预设</span>
            <button className={preset === 'quad' ? 'on' : ''} onClick={() => selectPreset('quad')}>
              四宫格
            </button>
            <button className={preset === 'flow' ? 'on' : ''} onClick={() => selectPreset('flow')}>
              自上而下
            </button>
          </div>
        )}
        <span className="mock-note">mock 数据 · 不请求 Twelve Data · 不消耗 credits</span>
      </header>
      <main className="app-main">
        {layout === 'a' && <VariantA preset={preset} onState={setStateText} />}
        {layout === 'b' && <VariantB onState={setStateText} />}
        {layout === 'c' && <VariantC onState={setStateText} />}
      </main>
      <BottomBar current={layout} onSelect={select} stateText={stateText} />
    </div>
  )
}
