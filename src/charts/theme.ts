// 图表配色 —— 已过 dataviz validate_palette.js(暗色 surface #070707):
//   分类线色 6 槽:全部 PASS(最差相邻 CVD ΔE 10.7 deutan,正常视觉最差 ΔE 26.8)
//   涨跌极性对:PASS(deutan ΔE 19.3)
// 规则:分类色按槽位顺序固定分配,永不循环;超过 6 条序列在 UI 层拒绝。
// 单序列图(指标卡)不占分类色,用中性 ink 线,避免和 Ratio 的身份色混淆。

export const CHART_COLORS = {
  series: ['#d27c00', '#00a5cc', '#eb5249', '#906ae5', '#3cae48', '#db4594'],
  single: '#d7d7d7',
  up: '#00a5cc',
  down: '#eb5249',
  surface: '#070707',
  // 网格与十字线是读数工具,不是探测器硬件:用中性色,铜色只留给环、刻度、零线
  grid: 'rgba(255, 255, 255, 0.075)',
  watermark: 'rgba(255, 255, 255, 0.05)',
  crosshair: '#5e5e5e',
  crosshairLabel: '#262626',
  edge: '#262626',
  copper: '#d08b6f',
  copperDim: '#674335',
  muted: '#ababab',
  ink: '#ebebeb',
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
