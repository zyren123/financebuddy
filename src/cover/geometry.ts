/**
 * 探测器几何:读数 → 径迹。
 * - 半径编码 |ROC|:每一环是一档(step%),径迹终点落在 |ROC| 对应的半径上,打在第几环由数值决定。
 * - 偏转方向编码正负:负值(成长跑赢)顺时针卷,正值(价值跑赢)逆时针卷,像带电粒子在磁场里按电荷分向。
 * 纯函数,便于单测;SVG 坐标系 y 轴向下。
 */

export const VIEW = 1000
export const CENTER = VIEW / 2
/** 最外环半径(留出标签空间) */
export const OUTER = 400
/** 贴近顶点的最小半径,避免 ≈0 的读数缩成一个点 */
export const INNER = 36
/** 径迹卷曲角(弧所对圆心角),固定值:曲率只表达方向,长度表达大小 */
const CURL = (70 * Math.PI) / 180

const NICE_STEPS = [1, 2, 2.5, 5, 10, 20, 25, 50]

/** 环的档距:让最大读数落在最外几环之内,且至少 3 环、至多 6 环 */
export function ringScale(values: number[]): { step: number; rings: number } {
  const max = Math.max(1, ...values.map((v) => Math.abs(v)))
  for (const step of NICE_STEPS) {
    const rings = Math.ceil((max * 1.08) / step)
    if (rings <= 6) return { step, rings: Math.max(3, rings) }
  }
  return { step: 100, rings: Math.max(3, Math.ceil(max / 100)) }
}

export function radiusOf(value: number, step: number, rings: number): number {
  const frac = Math.min(1, Math.abs(value) / (step * rings))
  return INNER + frac * (OUTER - INNER)
}

export interface TrackGeom {
  /** SVG path d,从顶点出发 */
  d: string
  end: { x: number; y: number }
  radius: number
  /** 终点方向(弧度),用于放标签 */
  angle: number
}

/** 第 i 条径迹(共 n 条)的发射角:均匀分布,首条朝左上 */
export function emitAngle(i: number, n: number): number {
  return -Math.PI * 0.72 + (i * 2 * Math.PI) / Math.max(1, n)
}

export function track(value: number, emit: number, step: number, rings: number): TrackGeom {
  const radius = radiusOf(value, step, rings)
  // 负值顺时针:屏幕坐标里角度增大即顺时针
  const sign = value < 0 ? 1 : -1
  // 圆弧所对圆心角为 CURL 时,弦方向比切线方向偏转 CURL/2
  const angle = emit + (sign * CURL) / 2
  const end = { x: CENTER + radius * Math.cos(angle), y: CENTER + radius * Math.sin(angle) }
  const arcR = radius / (2 * Math.sin(CURL / 2))
  const sweep = sign > 0 ? 1 : 0
  const d = `M ${CENTER} ${CENTER} A ${arcR.toFixed(2)} ${arcR.toFixed(2)} 0 0 ${sweep} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`
  return { d, end, radius, angle }
}
