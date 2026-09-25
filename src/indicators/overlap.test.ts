import { describe, expect, it } from 'vitest'
import { ema, sma } from './overlap'
import { numbersToPoints } from './series'

describe('sma', () => {
  it('滑动窗口均值,输出从第 period 个点开始', () => {
    const out = sma(numbersToPoints([1, 2, 3, 4]), 2)
    expect(out.map((p) => p.value)).toEqual([1.5, 2.5, 3.5])
    expect(out[0]!.datetime).toBe('d1')
  })

  it('period 大于长度返回空数组', () => {
    expect(sma(numbersToPoints([1, 2]), 3)).toEqual([])
  })
})

describe('ema', () => {
  it('以首个 SMA 为种子,之后递推(k=2/(p+1))', () => {
    // p=3, k=0.5:种子=(1+2+3)/3=2;然后 2+0.5*(4-2)=3;3+0.5*(5-3)=4
    const out = ema(numbersToPoints([1, 2, 3, 4, 5]), 3)
    expect(out.map((p) => p.value)).toEqual([2, 3, 4])
    expect(out[0]!.datetime).toBe('d2')
  })

  it('长度不足返回空数组', () => {
    expect(ema(numbersToPoints([1, 2]), 3)).toEqual([])
  })
})
