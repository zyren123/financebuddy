import type { RatioReading } from '../data/useRatioReadings'
import { verdictOf } from '../data/useRatioReadings'

/** 已知的成长基准:分母是它们时,"分母跑赢"可以直接说成"成长领先" */
const GROWTH_BENCHMARKS = new Set(['QQQ', 'QQQM', 'VUG', 'SCHG', 'IWF'])

const split = (label: string) => {
  const [num = label, den = ''] = label.split('/')
  return { num, den }
}

/** 所有 Ratio 共用的分母;不一致时为 null */
export function sharedDenominator(readings: RatioReading[]): string | null {
  const dens = new Set(readings.map((r) => split(r.label).den))
  return dens.size === 1 ? [...dens][0]! : null
}

/** 封面标题:由读数机械生成 */
export function headlineOf(readings: RatioReading[]): string | null {
  const v = verdictOf(readings)
  if (!v) return null
  if (v === 'mixed') return '风格分化'
  const den = sharedDenominator(readings)
  const growthDen = den != null && GROWTH_BENCHMARKS.has(den)
  if (v === 'growth') return growthDen ? '成长领先' : `${den ?? '分母'}领先`
  return growthDen ? '价值领先' : '分子领先'
}

/** 标题下的一句话:哪些为正、哪些为负 */
export function leadOf(readings: RatioReading[], period: number): string | null {
  const v = verdictOf(readings)
  if (!v) return null
  const den = sharedDenominator(readings)
  const name = (r: RatioReading) => (den ? split(r.label).num : r.label)
  const vs = den ? `相对 ${den} ` : ''
  if (v === 'growth' || v === 'value') {
    const names = readings.map(name).join('、')
    return `${names} ${vs}的 ${period} 日比值动量全部为${v === 'growth' ? '负' : '正'}。`
  }
  const pos = readings.filter((r) => r.value > 0).map(name).join('、')
  const neg = readings.filter((r) => r.value <= 0).map(name).join('、')
  return `${den ? `相对 ${den}，` : ""}${pos} 为正，${neg} 为负。`
}
