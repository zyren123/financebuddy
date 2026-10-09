import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { get, set } from 'idb-keyval'
import { addDays } from '../lib/date'
import { ensureBars, mergeBars } from './barsStore'
import { fetchBars, type FetchBarsOpts } from './twelveData'
import type { Bar } from './types'

vi.mock('idb-keyval', () => ({ get: vi.fn(), set: vi.fn() }))
vi.mock('./twelveData', () => ({ fetchBars: vi.fn() }))

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

/** 区间内的工作日(近似交易日),升序 */
function weekdays(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay()
    if (dow !== 0 && dow !== 6) out.push(d)
  }
  return out
}

/** 模拟 Twelve Data 实测语义:先按日期区间过滤,再按 outputsize 截断,只留最新 N 根 */
function fakeServer(allDates: string[]) {
  return async (opts: FetchBarsOpts): Promise<Bar[]> => {
    const inRange = allDates.filter(
      (d) => (!opts.startDate || d >= opts.startDate) && (!opts.endDate || d <= opts.endDate),
    )
    return inRange.slice(-(opts.outputsize ?? 5000)).map((d) => bar(d, 100))
  }
}

describe('ensureBars', () => {
  const TODAY = '2026-10-09'
  const HOUR = 60 * 60 * 1000
  const history = weekdays('2026-01-01', TODAY)

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`))
    vi.mocked(fetchBars).mockImplementation(fakeServer(history))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.resetAllMocks()
  })

  const cacheUpTo = (last: string, syncedAt: number) =>
    vi.mocked(get).mockResolvedValue({
      bars: history.filter((d) => d <= last).map((d) => bar(d, 100)),
      syncedAt,
    })

  it('6h 内直接返回缓存,不发请求', async () => {
    cacheUpTo('2026-10-08', Date.now() - HOUR)
    const bars = await ensureBars('QQQ', '1day')
    expect(bars.at(-1)!.datetime).toBe('2026-10-08')
    expect(fetchBars).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
  })

  it('无缓存时全量拉取并写回', async () => {
    vi.mocked(get).mockResolvedValue(undefined)
    const bars = await ensureBars('QQQ', '1day')
    expect(bars.map((b) => b.datetime)).toEqual(history)
    expect(set).toHaveBeenCalledWith('bars:QQQ:1day', { bars, syncedAt: Date.now() })
  })

  it('短缺口:从最后一根次日起增量补齐', async () => {
    cacheUpTo('2026-10-02', Date.now() - 7 * HOUR)
    const bars = await ensureBars('QQQ', '1day')
    expect(fetchBars).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: '2026-10-03', endDate: TODAY }),
    )
    expect(bars.map((b) => b.datetime)).toEqual(history)
  })

  it('长缺口(超过 30 个交易日)不能在中间留下空洞', async () => {
    cacheUpTo('2026-06-30', Date.now() - 100 * 24 * HOUR)
    const bars = await ensureBars('QQQ', '1day')
    expect(bars.map((b) => b.datetime)).toEqual(history)
  })

  it('增量失败(如额度用完)时退回旧缓存,且不刷新同步时间', async () => {
    cacheUpTo('2026-10-02', Date.now() - 7 * HOUR)
    vi.mocked(fetchBars).mockRejectedValue(new Error('代理请求失败:HTTP 429 run out of API credits for the day'))
    const bars = await ensureBars('QQQ', '1day')
    expect(bars.at(-1)!.datetime).toBe('2026-10-02')
    expect(set).not.toHaveBeenCalled()
  })

  it('无缓存时的全量失败照常抛出', async () => {
    vi.mocked(get).mockResolvedValue(undefined)
    vi.mocked(fetchBars).mockRejectedValue(new Error('代理请求失败:HTTP 429'))
    await expect(ensureBars('QQQ', '1day')).rejects.toThrow('HTTP 429')
  })
})
