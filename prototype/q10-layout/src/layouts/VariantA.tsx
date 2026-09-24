// A · 可拖拽网格(react-grid-layout,类 Grafana):拖标题栏换位、拉右下/右/下边缘调宽高
// 两种默认预设:四宫格(2×2 + 底部通栏)/ 自上而下(B 的观感,但每张卡可拖可调)
import { useEffect, useState } from 'react'
import ReactGridLayout, { WidthProvider, type LayoutItem } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { CARDS } from '../cards'
import ChartCard from '../components/ChartCard'

const Grid = WidthProvider(ReactGridLayout)

export type PresetKey = 'quad' | 'flow'

const PRESETS: Record<PresetKey, LayoutItem[]> = {
  quad: [
    { i: 'qqq-candle', x: 0, y: 0, w: 6, h: 4 },
    { i: 'ratio-roc', x: 6, y: 0, w: 6, h: 4 },
    { i: 'qqq-rsi', x: 0, y: 4, w: 6, h: 3 },
    { i: 'schd-candle', x: 6, y: 4, w: 6, h: 3 },
    { i: 'qqq-roc', x: 0, y: 7, w: 12, h: 3 },
  ],
  flow: [
    { i: 'qqq-candle', x: 0, y: 0, w: 12, h: 4 },
    { i: 'ratio-roc', x: 0, y: 4, w: 12, h: 4 },
    { i: 'qqq-rsi', x: 0, y: 8, w: 12, h: 3 },
    { i: 'schd-candle', x: 0, y: 11, w: 12, h: 4 },
    { i: 'qqq-roc', x: 0, y: 15, w: 12, h: 3 },
  ],
}

export const PRESET_NAMES: Record<PresetKey, string> = { quad: '四宫格', flow: '自上而下' }

const norm = (l: readonly LayoutItem[]) => l.map((i) => ({ i: i.i, x: i.x, y: i.y, w: i.w, h: i.h }))

export default function VariantA({ preset, onState }: { preset: PresetKey; onState: (s: string) => void }) {
  const [layout, setLayout] = useState<LayoutItem[]>(PRESETS[preset])

  useEffect(() => {
    setLayout(PRESETS[preset])
  }, [preset])

  const summarize = (l: readonly LayoutItem[], p: PresetKey) => {
    const dirty = JSON.stringify(norm(l)) !== JSON.stringify(norm(PRESETS[p]))
    return (
      `预设:${PRESET_NAMES[p]}${dirty ? '(已手动调整)' : ''}\n\n` +
      l.map((i) => `${i.i.padEnd(13)} x=${i.x}  y=${i.y}  w=${i.w}  h=${i.h}`).join('\n')
    )
  }

  return (
    <div className="rgl-wrap">
      <Grid
        layout={layout}
        cols={12}
        rowHeight={100}
        margin={[8, 8]}
        containerPadding={[8, 8]}
        draggableHandle=".card-drag-handle"
        resizeHandles={['se', 'e', 's']}
        onLayoutChange={(l) => {
          setLayout(norm(l))
          onState(summarize(l, preset))
        }}
      >
        {CARDS.map((def) => (
          <div key={def.id} className="rgl-item">
            <ChartCard def={def} />
          </div>
        ))}
      </Grid>
    </div>
  )
}
