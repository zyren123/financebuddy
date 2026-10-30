/**
 * 与 pandas 2.3 `Series.rolling(window)`(min_periods = window)逐位一致的滚动统计,均为 O(n)。
 * 照搬 pandas/_libs/window/aggregations.pyx 的 Welford/Kahan 增删顺序(先删出窗值,再加新值,
 * 增删各用一个补偿项):信号门限是严格不等式,末位差一点也可能让某天的判定翻转。NaN 不计观测数。
 */

export function rollingStd(values: Float64Array, window: number): Float64Array {
  const n = values.length
  const out = new Float64Array(n).fill(NaN)
  if (window < 2) return out
  let nobs = 0
  let mean = 0
  let ssqdm = 0
  let compAdd = 0
  let compRemove = 0
  let sameRun = 0
  let prev = n > 0 ? values[0] : NaN
  for (let i = 0; i < n; i++) {
    if (i >= window) {
      const v = values[i - window]
      if (v === v) {
        nobs--
        if (nobs) {
          const prevMean = mean - compRemove
          const y = v - compRemove
          const t = y - mean
          compRemove = t + mean - y
          mean -= t / nobs
          ssqdm -= (v - prevMean) * (v - mean)
        } else {
          mean = 0
          ssqdm = 0
        }
      }
    }
    const v = values[i]
    if (v === v) {
      nobs++
      sameRun = v === prev ? sameRun + 1 : 1
      prev = v
      const prevMean = mean - compAdd
      const y = v - compAdd
      const t = y - mean
      compAdd = t + mean - y
      mean += t / nobs
      ssqdm += (v - prevMean) * (v - mean)
    }
    if (nobs >= window) {
      const variance = sameRun >= nobs ? 0 : ssqdm / (nobs - 1)
      out[i] = variance < 0 ? 0 : Math.sqrt(variance)
    }
  }
  return out
}

export function rollingMean(values: Float64Array, window: number): Float64Array {
  const n = values.length
  const out = new Float64Array(n).fill(NaN)
  if (window < 1) return out
  if (window === 1) {
    for (let i = 0; i < n; i++) out[i] = values[i]
    return out
  }
  let nobs = 0
  let sum = 0
  let negatives = 0
  let compAdd = 0
  let compRemove = 0
  let sameRun = 0
  let prev = n > 0 ? values[0] : NaN
  for (let i = 0; i < n; i++) {
    if (i >= window) {
      const v = values[i - window]
      if (v === v) {
        nobs--
        const y = -v - compRemove
        const t = sum + y
        compRemove = t - sum - y
        sum = t
        if (v < 0 || Object.is(v, -0)) negatives--
      }
    }
    const v = values[i]
    if (v === v) {
      nobs++
      const y = v - compAdd
      const t = sum + y
      compAdd = t - sum - y
      sum = t
      if (v < 0 || Object.is(v, -0)) negatives++
      sameRun = v === prev ? sameRun + 1 : 1
      prev = v
    }
    if (nobs >= window) {
      let result = sum / nobs
      if (sameRun >= nobs) result = prev
      else if (negatives === 0 && result < 0) result = 0
      else if (negatives === nobs && result > 0) result = 0
      out[i] = result
    }
  }
  return out
}

/** 单调递减双端队列;窗口含当日。值来自收盘价,没有 NaN。 */
export function rollingMax(values: Float64Array, window: number): Float64Array {
  const n = values.length
  const out = new Float64Array(n).fill(NaN)
  const deque = new Int32Array(n)
  let head = 0
  let tail = 0
  for (let i = 0; i < n; i++) {
    while (tail > head && values[deque[tail - 1]] <= values[i]) tail--
    deque[tail++] = i
    if (deque[head] <= i - window) head++
    if (i >= window - 1) out[i] = values[deque[head]]
  }
  return out
}
