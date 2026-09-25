// 图表配色 —— 已过 dataviz validate_palette.js(暗色 surface #1e222d):
//   分类线色 6 槽:全部 PASS(最差相邻 CVD ΔE 12.5)
//   涨跌极性对:全部 PASS(deutan ΔE 11.6)
// 规则:分类色按槽位顺序固定分配,永不循环;超过 6 条序列在 UI 层拒绝。

export const CHART_COLORS = {
  series: ['#2962ff', '#cc6a10', '#ab47bc', '#26a69a', '#c98500', '#d55181'],
  up: '#26a69a',
  down: '#ef5350',
  surface: '#1e222d',
  grid: '#2a2e39',
  edge: '#2a2e39',
  muted: '#787b86',
  ink: '#d1d4dc',
} as const

export const MAX_SERIES_PER_CARD = 6

/** hex → rgba(…, alpha) */
export function withAlpha(hex: string, alpha: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
