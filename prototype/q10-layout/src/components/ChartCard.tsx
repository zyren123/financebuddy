// CardDef → 具体图表组件的绑定(所有布局共用同一组卡片)
import { useState } from 'react'
import CandleChart from '../chart/CandleChart'
import RatioRocChart from '../chart/RatioRocChart'
import IndicatorChart from '../chart/IndicatorChart'
import type { RangeKey } from '../chart/chartBase'
import type { CardDef } from '../cards'
import CardShell, { RangeButtons } from './CardShell'

export default function ChartCard({ def, className }: { def: CardDef; className?: string }) {
  const [range, setRange] = useState<RangeKey>('3Y') // 卡片默认显示最近 3 年(已定决策)
  return (
    <CardShell
      title={def.title}
      subtitle={def.subtitle}
      className={className}
      right={<RangeButtons value={range} onChange={setRange} />}
    >
      {def.kind === 'candle' && def.ticker && <CandleChart ticker={def.ticker} range={range} />}
      {def.kind === 'ratioRoc' && <RatioRocChart range={range} />}
      {(def.kind === 'rsi' || def.kind === 'roc') && <IndicatorChart kind={def.kind} range={range} />}
    </CardShell>
  )
}
