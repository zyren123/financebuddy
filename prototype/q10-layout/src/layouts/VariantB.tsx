// B · 自动流式:卡片按添加顺序自上而下、等宽全幅排列,零布局操作
import { useEffect } from 'react'
import { CARDS } from '../cards'
import ChartCard from '../components/ChartCard'

export default function VariantB({ onState }: { onState: (s: string) => void }) {
  useEffect(() => {
    onState(
      CARDS.map((c, i) => `${String(i + 1).padStart(2)}. ${c.title.padEnd(16)} ${c.subtitle}`).join('\n') +
        '\n\n(无任何布局状态:顺序即配置,高度/宽度固定)',
    )
  }, [onState])

  return (
    <div className="flow-col">
      {CARDS.map((def) => (
        <ChartCard key={def.id} def={def} className="flow-card" />
      ))}
    </div>
  )
}
