// ── 抛弃式原型 · 指标计算 ────────────────────────────────────────────────────
// 与已定架构口径一致:只用原始 OHLCV,全部前端计算。
import type { Bar } from './data'

export interface Point {
  time: string
  value: number
}

// Ratio ROC(见仓库根 CONTEXT.md):先按日期对齐构造比值序列 close(A)/close(B),
// 再算 N 日 ROC(ratio[t]/ratio[t-N] - 1),N 默认 35。
export function ratioRoc(a: Bar[], b: Bar[], n = 35): Point[] {
  const closeB = new Map(b.map((x) => [x.time, x.close]))
  const ratio: { t: string; v: number }[] = []
  for (const bar of a) {
    const cb = closeB.get(bar.time)
    if (cb != null) ratio.push({ t: bar.time, v: bar.close / cb })
  }
  const out: Point[] = []
  for (let i = n; i < ratio.length; i++) {
    out.push({ time: ratio[i].t, value: (ratio[i].v / ratio[i - n].v - 1) * 100 })
  }
  return out
}

// 单 Ticker 收盘价 N 日 ROC
export function roc(bars: Bar[], n = 35): Point[] {
  const out: Point[] = []
  for (let i = n; i < bars.length; i++) {
    out.push({ time: bars[i].time, value: (bars[i].close / bars[i - n].close - 1) * 100 })
  }
  return out
}

// Wilder RSI
export function rsi(bars: Bar[], n = 14): Point[] {
  const out: Point[] = []
  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i < bars.length; i++) {
    const ch = bars[i].close - bars[i - 1].close
    const gain = Math.max(ch, 0)
    const loss = Math.max(-ch, 0)
    if (i <= n) {
      avgGain += gain / n
      avgLoss += loss / n
      if (i === n) out.push({ time: bars[i].time, value: 100 - 100 / (1 + avgGain / avgLoss) })
    } else {
      avgGain = (avgGain * (n - 1) + gain) / n
      avgLoss = (avgLoss * (n - 1) + loss) / n
      const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss
      out.push({ time: bars[i].time, value: 100 - 100 / (1 + rs) })
    }
  }
  return out
}
