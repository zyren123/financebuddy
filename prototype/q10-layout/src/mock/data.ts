// ── 抛弃式原型 · 确定性 mock 行情 ────────────────────────────────────────────
// 本地 seed 随机生成日线 OHLCV(仅跳过周末),不请求 Twelve Data、不消耗 credits。
// 用粗略市场阶段(2022 熊市 / 2023-24 复苏 / 2025-04 急跌)让图看起来像真的,
// 数值不对应真实历史;确定性的目的是刷新/切换布局后图不变。
//
// PROTOTYPE — 正式实现的数据层在仓库别处,勿复用本文件。

export interface Bar {
  time: string // 'YYYY-MM-DD'
  open: number
  high: number
  low: number
  close: number
  volume: number
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gauss(rng: () => number): number {
  const u = Math.max(rng(), 1e-9)
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

interface Regime {
  from: string
  mu: number // 日漂移
  sigma: number // 日波动
}

function fmtDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const END = new Date(2026, 8, 24) // 2026-09-24,原型当日

const r2 = (x: number) => Math.round(x * 100) / 100

function genBars(seed: number, start: string, startPrice: number, baseVolume: number, regimes: Regime[]): Bar[] {
  const rng = mulberry32(seed)
  const bars: Bar[] = []
  const [sy, sm, sd] = start.split('-').map(Number)
  const d = new Date(sy, sm - 1, sd)
  let prevClose = startPrice
  while (d <= END) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) {
      const t = fmtDate(d)
      const reg = [...regimes].reverse().find((r) => t >= r.from)!
      const open = prevClose * Math.exp(0.12 * reg.sigma * gauss(rng)) // 隔夜小跳空
      const close = open * Math.exp(reg.mu + reg.sigma * gauss(rng))
      const high = Math.max(open, close) * Math.exp(Math.abs(gauss(rng)) * 0.3 * reg.sigma)
      const low = Math.min(open, close) * Math.exp(-Math.abs(gauss(rng)) * 0.3 * reg.sigma)
      const volume = Math.round(baseVolume * (0.55 + 0.9 * rng()) * (1 + 20 * Math.abs(Math.log(close / open))))
      bars.push({ time: t, open: r2(open), high: r2(high), low: r2(low), close: r2(close), volume })
      prevClose = close
    }
    d.setDate(d.getDate() + 1)
  }
  return bars
}

// QQQ:2021-09 ~368 → 2022 熊市 → 2023-24 复苏 → 2025-04 急跌 → 修复
const QQQ_REGIMES: Regime[] = [
  { from: '2021-09-24', mu: 0.0003, sigma: 0.01 },
  { from: '2022-01-03', mu: -0.0016, sigma: 0.016 },
  { from: '2023-01-03', mu: 0.0014, sigma: 0.011 },
  { from: '2024-01-02', mu: 0.0009, sigma: 0.009 },
  { from: '2025-03-15', mu: -0.0038, sigma: 0.028 },
  { from: '2025-04-18', mu: 0.0017, sigma: 0.013 },
  { from: '2025-09-01', mu: 0.0006, sigma: 0.01 },
]

// VTV:价值股,波动小;2024-25 相对 QQQ 持续走弱(比值下行)
const VTV_REGIMES: Regime[] = [
  { from: '2021-09-24', mu: 0.0002, sigma: 0.008 },
  { from: '2022-01-03', mu: -0.0003, sigma: 0.01 },
  { from: '2023-01-03', mu: 0.0004, sigma: 0.007 },
  { from: '2024-01-02', mu: 0.0001, sigma: 0.007 },
  { from: '2025-03-15', mu: -0.0012, sigma: 0.018 },
  { from: '2025-04-18', mu: 0.0006, sigma: 0.009 },
  { from: '2025-09-01', mu: 0.0002, sigma: 0.008 },
]

// SCHD:高息股,2023Q4 有一段小回撤
const SCHD_REGIMES: Regime[] = [
  { from: '2021-09-24', mu: 0.0003, sigma: 0.007 },
  { from: '2022-01-03', mu: -0.0002, sigma: 0.008 },
  { from: '2023-01-03', mu: 0.0004, sigma: 0.007 },
  { from: '2023-10-02', mu: -0.0005, sigma: 0.009 },
  { from: '2024-01-15', mu: 0.0003, sigma: 0.007 },
  { from: '2025-03-15', mu: -0.001, sigma: 0.016 },
  { from: '2025-04-18', mu: 0.0005, sigma: 0.008 },
  { from: '2025-09-01', mu: 0.0001, sigma: 0.007 },
]

// CGDV:2022-03-31 上市,数据从该日起(比值对齐天然处理)
const CGDV_REGIMES: Regime[] = [
  { from: '2022-03-31', mu: -0.0003, sigma: 0.009 },
  { from: '2023-01-03', mu: 0.0006, sigma: 0.008 },
  { from: '2024-01-02', mu: 0.0003, sigma: 0.008 },
  { from: '2025-03-15', mu: -0.0013, sigma: 0.019 },
  { from: '2025-04-18', mu: 0.0007, sigma: 0.009 },
  { from: '2025-09-01', mu: 0.0002, sigma: 0.008 },
]

export const BARS = {
  QQQ: genBars(7, '2021-09-24', 368, 48_000_000, QQQ_REGIMES),
  VTV: genBars(21, '2021-09-24', 122, 1_600_000, VTV_REGIMES),
  SCHD: genBars(33, '2021-09-24', 75.5, 3_100_000, SCHD_REGIMES),
  CGDV: genBars(55, '2022-03-31', 51.2, 350_000, CGDV_REGIMES),
}

export type TickerKey = keyof typeof BARS
