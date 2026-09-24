// C · IDE 式停靠(dockview,类 VS Code):拖标签页任意分屏 / 合并成标签组 / 浮动 / 弹出窗口
import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from 'dockview-react'
import 'dockview/dist/styles/dockview.css'
import { CARDS } from '../cards'
import ChartCard from '../components/ChartCard'

type PanelParams = { defId: string }

function CardPanel(props: IDockviewPanelProps<PanelParams>) {
  const def = CARDS.find((c) => c.id === props.params.defId)
  if (!def) return null
  return (
    <div className="dock-panel">
      <ChartCard def={def} />
    </div>
  )
}

function summarize(api: DockviewApi): string {
  const groups = api.groups // v8:属性而非方法
  return (
    groups
      .map((g, i) => {
        const tabs = g.panels
          .map((p) => (p.api.isActive ? `▸ ${p.api.title ?? p.id}` : `  ${p.api.title ?? p.id}`))
          .join('\n    ')
        return `组 ${i + 1}(${g.panels.length} 个标签)\n    ${tabs}`
      })
      .join('\n') + '\n\n(拖动标签页可改变上面的分组结构)'
  )
}

export default function VariantC({ onState }: { onState: (s: string) => void }) {
  const onReady = (e: DockviewReadyEvent) => {
    const api = e.api
    api.addPanel({ id: 'qqq-candle', component: 'card', title: 'QQQ · 日线', params: { defId: 'qqq-candle' } })
    api.addPanel({
      id: 'ratio-roc',
      component: 'card',
      title: 'Ratio ROC 35',
      params: { defId: 'ratio-roc' },
      position: { referencePanel: 'qqq-candle', direction: 'right' },
    })
    api.addPanel({
      id: 'qqq-rsi',
      component: 'card',
      title: 'QQQ RSI 14',
      params: { defId: 'qqq-rsi' },
      position: { referencePanel: 'ratio-roc', direction: 'below' },
    })
    // 'within' = 合并进参考面板所在的组,成为标签页 —— 初始就展示「分屏 + 标签组」两种形态
    api.addPanel({
      id: 'schd-candle',
      component: 'card',
      title: 'SCHD · 日线',
      params: { defId: 'schd-candle' },
      position: { referencePanel: 'qqq-rsi', direction: 'within' },
    })
    api.addPanel({
      id: 'qqq-roc',
      component: 'card',
      title: 'QQQ ROC 35',
      params: { defId: 'qqq-roc' },
      position: { referencePanel: 'schd-candle', direction: 'within' },
    })
    const emit = () => onState(summarize(api))
    api.onDidLayoutChange(emit)
    emit()
  }

  return (
    <div className="dock-wrap">
      <DockviewReact components={{ card: CardPanel }} onReady={onReady} className="dockview-theme-abyss" />
    </div>
  )
}
