// 图表配色 —— 已过 dataviz validate_palette.js(暗色 surface #0e0c0b):
//   分类线色 6 槽:全部 PASS(最差相邻 CVD ΔE 11.1 deutan,正常视觉最差 ΔE 23.4)
//   涨跌极性对:PASS(deutan ΔE 16.9)
// 规则:分类色按槽位顺序固定分配,永不循环;超过 6 条序列在 UI 层拒绝。
// 单序列图(指标卡)不占分类色,用中性 ink 线,避免和 Ratio 的身份色混淆。

export const CHART_COLORS = {
  series: ['#bc8800', '#00a4c0', '#e15a4e', '#8968d4', '#5ba84a', '#ca5794'],
  single: '#d8cfc4',
  up: '#00a4c0',
  down: '#e15a4e',
  surface: '#0e0c0b',
  grid: 'rgba(185, 138, 94, 0.09)',
  edge: '#2b2420',
  copper: '#b98a5e',
  copperDim: '#5a4636',
  muted: '#9c9187',
  ink: '#ece5dc',
} as const

export const MAX_SERIES_PER_CARD = 6

export const MONO_FONT = "'Martian Mono Variable', ui-monospace, Menlo, monospace"

/** hex → rgba(…, alpha) */
export function withAlpha(hex: string, alpha: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
