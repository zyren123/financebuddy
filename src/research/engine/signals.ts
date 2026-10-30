/**
 * 三门信号与 SMA 滞回带,逐行移植 backtest.py 的 signals()/confirm()/drawdown_gate()/sma_band_signals()。
 * 信号 t 只用 t 及以前的收盘;输出 0/1 目标仓位(在 t 收盘决定)。
 */
import type { GateParams } from '../types'
import { rollingMax, rollingMean, rollingStd } from './rolling'

const SQRT_252 = Math.sqrt(252)

/** 只依赖 (shortWindow, longWindow) 的中间量;同一世界里的门限变体共享它 */
export interface GateIndicators {
  shortVol: Float64Array
  shock: Float64Array
  drawdown: Float64Array
  valid: Uint8Array
}

export function pctChange(close: Float64Array): Float64Array {
  const out = new Float64Array(close.length)
  out[0] = NaN
  for (let i = 1; i < close.length; i++) out[i] = close[i] / close[i - 1] - 1
  return out
}

export function gateIndicators(close: Float64Array, returns: Float64Array, shortWindow: number, longWindow: number,
  stdCache = new Map<number, Float64Array>()): GateIndicators {
  const std = (w: number) => {
    let s = stdCache.get(w)
    if (!s) stdCache.set(w, (s = rollingStd(returns, w)))
    return s
  }
  const short = std(shortWindow)
  const long = std(longWindow)
  const max = rollingMax(close, longWindow)
  const n = close.length
  const shortVol = new Float64Array(n)
  const shock = new Float64Array(n)
  const drawdown = new Float64Array(n)
  const valid = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const s = short[i] * SQRT_252
    const l = long[i] * SQRT_252
    shortVol[i] = s
    shock[i] = s / l
    drawdown[i] = close[i] / max[i] - 1
    valid[i] = l === l && shock[i] === shock[i] ? 1 : 0
  }
  return { shortVol, shock, drawdown, valid }
}

export function gateSignal(ind: GateIndicators, p: GateParams): Uint8Array {
  const n = ind.valid.length
  const out = new Uint8Array(n)
  let ddOpen = true
  let state = 0
  let streak = 0
  let previous = -1
  for (let i = 0; i < n; i++) {
    if (ind.valid[i]) {
      const dd = ind.drawdown[i]
      if (dd < p.exitDrawdown) ddOpen = false
      else if (dd > p.reenterDrawdown) ddOpen = true
      const today = ind.shortVol[i] < p.volLimit && ind.shock[i] < p.shockLimit && ddOpen ? 1 : 0
      streak = today === previous ? streak + 1 : 1
      previous = today
      if (streak >= p.confirmationDays) state = today
    } else {
      streak = 0
      previous = -1
    }
    out[i] = state
  }
  return out
}

/** SMA 预热完成后:高于 SMA×(1+enter) 买入,低于 SMA×(1−exit) 卖出,中间保持 */
export function smaBand(close: Float64Array, window: number, enter: number, exit: number, average = rollingMean(close, window)): Uint8Array {
  const out = new Uint8Array(close.length)
  const up = 1 + enter
  const down = 1 - exit
  let state = 0
  for (let i = 0; i < close.length; i++) {
    const a = average[i]
    if (a === a) {
      if (close[i] > a * up) state = 1
      else if (close[i] < a * down) state = 0
    }
    out[i] = state
  }
  return out
}

export function threeGate(close: Float64Array, p: GateParams): Uint8Array {
  return gateSignal(gateIndicators(close, pctChange(close), p.shortWindow, p.longWindow), p)
}
