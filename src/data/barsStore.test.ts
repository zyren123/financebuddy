import { describe, expect, it } from 'vitest'
import { mergeBars } from './barsStore'
import type { Bar } from './types'

const bar = (datetime: string, close: number): Bar => ({
  datetime,
  open: close,
  high: close,
  low: close,
  close,
  volume: 100,
})

describe('mergeBars', () => {
  it('同日以新数据覆盖(收盘修正/盘中部分 K)', () => {
    const merged = mergeBars(
      [bar('2026-09-23', 100), bar('2026-09-24', 101)],
      [bar('2026-09-24', 101.5)],
    )
    expect(merged).toHaveLength(2)
    expect(merged[1]!.close).toBe(101.5)
  })

  it('新增日期按升序插入', () => {
    const merged = mergeBars(
      [bar('2026-09-22', 99), bar('2026-09-24', 101)],
      [bar('2026-09-23', 100), bar('2026-09-25', 102)],
    )
    expect(merged.map((b) => b.datetime)).toEqual([
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
    ])
  })

  it('newer 为空时原样返回 older', () => {
    const older = [bar('2026-09-22', 99)]
    expect(mergeBars(older, [])).toEqual(older)
  })
})
