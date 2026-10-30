import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadArchive, loadDataset, parseArchive, parseDataset } from './loadDataset'
import { rawArchive, rawDataset } from './testData'

const tiny = () => ({ dates: ['2000-01-03', '2000-01-04', '2000-01-05', '2000-01-06'], ndx: [0.01, 0, -0.02, 0.03], tqqq: [0.03, 0, -0.06, 0.09],
  qqq: [0.01, 0, -0.02, 0.03], spy: [0, 0.01, 0, 0], cash: [0.0001, 0.0001, 0.0001, 0.0001], evalStart: 1, realTqqqFrom: 1 }) as Record<string, unknown>

afterEach(() => vi.unstubAllGlobals())

describe('数据边界', () => {
  it('提交的 dataset.json 通过校验,收益变为 Float64Array', () => {
    const d = parseDataset(rawDataset)
    expect(d.ndx).toBeInstanceOf(Float64Array)
    expect(d.ndx.length).toBe(d.dates.length)
    expect(d.dates[d.evalStart]).toBe('1986-10-01')
    expect(d.dates[d.realTqqqFrom]).toBe('2010-02-12')
  })

  it.each([
    ['长度不一致', (d: Record<string, unknown>) => (d.spy = [0, 0, 0]), /spy 长度 3 与 dates 长度 4 不一致/],
    ['null 值', (d: Record<string, unknown>) => ((d.cash as unknown[])[2] = null), /cash\[2\] 不是大于 -1 的有限数/],
    ['收益 ≤ -1', (d: Record<string, unknown>) => ((d.tqqq as unknown[])[1] = -1), /tqqq\[1\]/],
    ['缺少序列', (d: Record<string, unknown>) => delete d.qqq, /缺少 qqq/],
    ['日期乱序', (d: Record<string, unknown>) => ((d.dates as string[])[2] = '2000-01-04'), /dates\[2\] 未严格递增/],
    ['起点越界', (d: Record<string, unknown>) => (d.evalStart = 9), /evalStart 不是有效行号/],
  ])('拒绝%s并给出中文原因', (_, mutate, message) => {
    const d = tiny()
    expect(() => parseDataset(d)).not.toThrow()
    mutate(d)
    expect(() => parseDataset(d)).toThrow(message)
  })

  it('读取失败时报出 HTTP 状态', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }))
    await expect(loadDataset()).rejects.toThrow('研究数据集读取失败:HTTP 404(/research/dataset.json)')
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ generated: {} })))
    await expect(loadArchive()).rejects.toThrow('研究归档无效:缺少 screen')
  })

  it('提交的 archive.json:summary、actual、strips、paired 的规则都在 worlds.rules 里', () => {
    const archive = parseArchive(rawArchive)
    const ids = new Set(archive.worlds.rules.map((r) => r.id))
    expect(archive.worlds.runs).toHaveLength(11)
    for (const run of archive.worlds.runs) {
      const summary = run.summary.map((s) => s.ruleId)
      expect(summary.every((id) => ids.has(id)), run.id).toBe(true)
      expect(Object.keys(run.actual).sort(), run.id).toEqual([...summary].sort())
      for (const strip of run.strips) {
        expect(ids.has(strip.ruleId)).toBe(true)
        expect(strip.cagr).toHaveLength(run.worlds)
      }
      const keys = run.strips.map((s) => s.ruleId)
      expect(Object.keys(run.paired).sort()).toEqual([...keys].sort())
      for (const a of keys) expect(Object.keys(run.paired[a]).sort()).toEqual(keys.filter((b) => b !== a).sort())
    }
    expect(archive.screen.trials).toHaveLength(archive.screen.nTrials)
  })
})
