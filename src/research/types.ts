/**
 * TQQQ 研究控制台的数据契约:引擎(engine/)与界面(ui/)只经由这里约定的形状交流。
 * 口径与 backtests/tqqq_gate 的 Python 引擎逐日一致:信号在 t 日收盘计算,t+lag 收盘成交,
 * 每次切换扣 costBps;防守腿为上一交易日 T-bill 代理利率。
 */

/** 每个交易日的同日收益,按原日历排列;第 0 行是 NDX 第二个收盘(首个收盘没有收益)。 */
export interface Dataset {
  /** ISO 日期,与各收益数组等长 */
  dates: string[]
  ndx: Float64Array
  /** 2010-02-11 前为合成 TQQQ,之后为真实 TQQQ 复权收益 */
  tqqq: Float64Array
  /** 1× 基础:QQQ 上市前为 NDX 价格收益,之后为 QQQ 复权收益;也是 SMA 的 QQQ 信号基准 */
  qqq: Float64Array
  /** SPYSIM 总收益近似,SMA 的 SPY 信号基准 */
  spy: Float64Array
  cash: Float64Array
  /** 第一个估值收盘的行号(= 251 + 执行延迟的基准值 1),与 Python bootstrap.py 的 START 一致 */
  evalStart: number
  /** 真实 TQQQ 收益开始的行号 */
  realTqqqFrom: number
}

export type ResampleMethod = 'actual' | 'permute' | 'stationary'

export interface GateParams {
  shortWindow: number
  longWindow: number
  volLimit: number
  shockLimit: number
  exitDrawdown: number
  reenterDrawdown: number
  confirmationDays: number
}

export const DEFAULT_GATE: GateParams = {
  shortWindow: 20,
  longWindow: 250,
  volLimit: 0.35,
  shockLimit: 1.1,
  exitDrawdown: -0.2,
  reenterDrawdown: -0.1,
  confirmationDays: 2,
}

/** ndx:NDX 价格(不含分红);qqq:1× 基础收益重建的总收益;spy:SPYSIM 总收益近似 */
export type SignalBasis = 'ndx' | 'qqq' | 'spy'

export type RuleSpec =
  | { kind: 'gate'; id: string; params: GateParams }
  /** 高于 SMA×(1+enter) 买入,低于 SMA×(1−exit) 卖出,中间保持 */
  | { kind: 'sma'; id: string; basis: SignalBasis; window: number; enter: number; exit: number }
  /** 固定 TQQQ 权重,漂移超出 band 时再平衡 */
  | { kind: 'fixed'; id: string; weight: number; band: number }
  | { kind: 'hold'; id: string; asset: 'tqqq' | 'qqq' }

export interface ExperimentConfig {
  method: Exclude<ResampleMethod, 'actual'>
  /** permute:块长;stationary:平均块长 */
  block: number
  worlds: number
  seed: number
  /** 至多 6 条,对应 6 个固定径迹色槽 */
  rules: RuleSpec[]
  executionLag: 0 | 1 | 2
  costBps: number
}

export interface Metrics {
  cagr: number
  maxDrawdown: number
  sharpe: number
  /** 平均 TQQQ 权重;持有 QQQ 记 0 */
  exposure: number
  switchesPerYear: number
}

/** 降采样后的 log10 净值,PATH_POINTS 个点,均匀覆盖评估区间 */
export const PATH_POINTS = 240

export interface WorldBatch {
  /** 本批第一个世界的序号 */
  from: number
  count: number
  /** ruleId → 本批每个世界的指标 */
  metrics: Record<string, Metrics[]>
  /** ruleId → 本批每个世界的降采样路径 */
  paths: Record<string, Float32Array[]>
}

export interface Quantiles {
  p05: number
  p25: number
  p50: number
  p75: number
  p95: number
}

export interface RuleSummary {
  ruleId: string
  worlds: number
  cagr: Quantiles
  maxDrawdown: Quantiles
  sharpe: Quantiles
  pDrawdownWorse70: number
  /** 真实历史在平行世界中的分位:比多少比例的世界好(回撤更浅 / 年化更高) */
  actualDrawdownPercentile: number
  actualCagrPercentile: number
}

/** paired[a][b]:同一批世界里 a 胜过 b 的比例 */
export type PairedWins = Record<string, Record<string, { cagr: number; maxDrawdown: number; sharpe: number }>>

export interface ExperimentResult {
  config: ExperimentConfig
  /** 真实历史(不打乱)上的指标与路径 */
  actual: Record<string, Metrics & { path: Float32Array }>
  metrics: Record<string, Metrics[]>
  paths: Record<string, Float32Array[]>
  /** 降采样点对应的日期 */
  pathDates: string[]
  summary: RuleSummary[]
  paired: PairedWins
  elapsedMs: number
}

// ---- Python 归档结果(public/research/archive.json),由 backtests/tqqq_gate/export_console.py 生成 ----

export interface WindowMetrics {
  cagr: number
  maxDrawdown: number
  sharpe: number
  exposure: number
  switchesPerYear: number
}

export type SegmentKey = 'pre2010' | 'post2010' | 'full'

export interface Archive {
  generated: { date: string; commit: string; start: string; split: string; end: string }
  /** RUN 01:48 个试验的预注册筛选 */
  screen: {
    nTrials: number
    spearman: number
    pbo: number
    pboExcludingPostHoc: number
    dsr: { label: string; trials: number; dsr: number }[]
    finalists: { label: string; family: string; selectedAs: string; oosRank: number | null; is: WindowMetrics; oos: WindowMetrics; full: WindowMetrics }[]
    families: { family: string; trials: number; isSharpe: [number, number]; oosSharpe: [number, number]; isRankMean: number; oosRankMean: number }[]
    /** 48 个点,画 IS/OOS Sharpe 散点 */
    trials: { label: string; family: string; postHoc: boolean; isSharpe: number; oosSharpe: number }[]
  }
  /** RUN 02:三门参数分段敏感性 */
  params: {
    baselines: { rule: 'tqqq_hold' | 'qqq_hold'; segments: Record<SegmentKey, WindowMetrics> }[]
    sweep: { axis: keyof GateParams; value: number; isDefault: boolean; segments: Record<SegmentKey, WindowMetrics> }[]
    grid: {
      size: number
      segments: Record<SegmentKey, { cagr: Quantiles; maxDrawdown: Quantiles; shareCagrAboveTqqq: number; shareDrawdownShallowerThanTqqq: number; shareSharpeAboveTqqq: number }>
      rankCorrelation: { cagr: number; sharpe: number; maxDrawdown: number }
      defaultSharpeRank: Record<SegmentKey, number>
    }
  }
  /** RUN 03:回撤相近的固定比例对照,与三门在标普上的跨资产检验 */
  matched: {
    fixedMix: { weight: number; segments: Record<SegmentKey, WindowMetrics> }[]
    gridMedian: Record<SegmentKey, WindowMetrics>
    sp500: {
      authorParams: Record<SegmentKey, WindowMetrics>
      grid: Record<SegmentKey, { cagrMedian: number; drawdownMedian: number; drawdownWorst: number; sharpeMedian: number; shareSharpeAbove1x: number }>
      hold3x: Record<SegmentKey, WindowMetrics>
      hold1x: Record<SegmentKey, WindowMetrics>
    }
  }
  /** RUN 04 / 05:Python 平行世界归档 */
  worlds: {
    runs: {
      id: string
      script: 'bootstrap.py' | 'bootstrap_params.py'
      method: Exclude<ResampleMethod, 'actual'>
      block: number
      worlds: number
      seed: number
      summary: RuleSummary[]
      /** 每条规则在真实历史顺序上的指标(不打乱) */
      actual: Record<string, WindowMetrics>
      /** 只为关键规则保留逐世界指标,画分布条 */
      strips: { ruleId: string; cagr: number[]; maxDrawdown: number[] }[]
      paired: PairedWins
    }[]
    /** 归档里出现的规则,id 与 summary.ruleId 对应 */
    rules: RuleSpec[]
  }
}
