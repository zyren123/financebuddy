import { describe, expect, it } from 'vitest'
import { roc, rsi } from './momentum'
import { numbersToPoints } from './series'

describe('roc(变动率,%)', () => {
  it('period=1:逐期涨跌百分比', () => {
    const out = roc(numbersToPoints([100, 110, 99]), 1)
    expect(out.map((p) => p.value)).toEqual([10, -10])
  })

  it('period=2:跳过前 period 个暖机点,datetime 对齐当前点', () => {
    const out = roc(numbersToPoints([100, 110, 121]), 2)
    expect(out).toHaveLength(1)
    expect(out[0]!.value).toBeCloseTo(21)
    expect(out[0]!.datetime).toBe('d2')
  })

  it('空/不足输入返回空数组', () => {
    expect(roc(numbersToPoints([1, 2]), 5)).toEqual([])
    expect(roc([], 1)).toEqual([])
  })
})

describe('rsi(Wilder 平滑)', () => {
  it('一路上涨 → 100', () => {
    const out = rsi(numbersToPoints(Array.from({ length: 16 }, (_, i) => i + 1)), 14)
    // 16 个点、p=14:输出在第 14、15 两个下标
    expect(out).toHaveLength(2)
    for (const p of out) expect(p.value).toBeCloseTo(100)
  })

  it('一路下跌 → 0', () => {
    const out = rsi(numbersToPoints(Array.from({ length: 16 }, (_, i) => 16 - i)), 14)
    expect(out[0]!.value).toBeCloseTo(0)
  })

  it('混合行情手算例(p=3)', () => {
    // 变化:+1,-1,+1,-1
    // idx3:avgGain=2/3, avgLoss=1/3 → RSI=100-100/(1+2)=66.6667
    // idx4:avgGain=4/9, avgLoss=5/9 → RS=0.8 → RSI=44.4444
    const out = rsi(numbersToPoints([10, 11, 10, 11, 10]), 3)
    expect(out).toHaveLength(2)
    expect(out[0]!.value).toBeCloseTo(100 - 100 / 3, 4)
    expect(out[1]!.value).toBeCloseTo(100 - 100 / 1.8, 4)
  })

  it('长度不足返回空数组', () => {
    expect(rsi(numbersToPoints([1, 2, 3]), 14)).toEqual([])
  })
})
