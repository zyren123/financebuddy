// A · 可拖拽网格(react-grid-layout,类 Grafana):拖标题栏换位、拉右下/右/下边缘调宽高
import ReactGridLayout, { WidthProvider, type LayoutItem } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { CARDS } from '../cards'
import ChartCard from '../components/ChartCard'

const Grid = WidthProvider(ReactGridLayout)

const INITIAL: LayoutItem[] = [
  { i: 'qqq-candle', x: 0, y: 0, w: 7, h: 4 },
  { i: 'ratio-roc', x: 7, y: 0, w: 5, h: 4 },
  { i: 'qqq-rsi', x: 0, y: 4, w: 4, h: 3 },
  { i: 'schd-candle', x: 4, y: 4, w: 4, h: 3 },
  { i: 'qqq-roc', x: 8, y: 4, w: 4, h: 3 },
]

export default function VariantA({ onState }: { onState: (s: string) => void }) {
  const summarize = (l: readonly LayoutItem[]) =>
    l.map((i) => `${i.i.padEnd(13)} x=${i.x}  y=${i.y}  w=${i.w}  h=${i.h}`).join('\n')

  return (
    <div className="rgl-wrap">
      <Grid
        layout={INITIAL}
        cols={12}
        rowHeight={100}
        margin={[8, 8]}
        containerPadding={[8, 8]}
        draggableHandle=".card-drag-handle"
        resizeHandles={['se', 'e', 's']}
        onLayoutChange={(l) => onState(summarize(l))}
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
