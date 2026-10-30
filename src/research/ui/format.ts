const MINUS = '−'

export function pct(value: number, digits = 1): string {
  const s = (Math.abs(value) * 100).toFixed(digits)
  return `${value < 0 && Number(s) !== 0 ? MINUS : ''}${s}%`
}

/** 比例读数:0.684 → 68%;用于"多少比例的世界" */
export function share(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function num(value: number, digits = 2): string {
  const s = Math.abs(value).toFixed(digits)
  return `${value < 0 && Number(s) !== 0 ? MINUS : ''}${s}`
}

/** 百分点差:−0.062 → −6.2 个百分点 */
export function pp(value: number, digits = 1): string {
  const s = (Math.abs(value) * 100).toFixed(digits)
  return `${value < 0 ? MINUS : value > 0 ? '+' : ''}${s}`
}

export function money(log10Equity: number): string {
  const v = 10 ** log10Equity
  if (v >= 1e4) return `$${Math.round(v).toLocaleString('en-US')}`
  if (v >= 100) return `$${v.toFixed(0)}`
  if (v >= 1) return `$${v.toFixed(2)}`
  return `$${v.toPrecision(2)}`
}

export function seconds(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} 毫秒` : `${(ms / 1000).toFixed(1)} 秒`
}
