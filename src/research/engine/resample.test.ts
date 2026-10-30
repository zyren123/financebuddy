import { describe, expect, it } from 'vitest'
import type { ExperimentConfig } from '../types'
import { DEFAULT_GATE } from '../types'
import { permutedBlocks, stationaryBootstrap, worldRandom } from './resample'
import { runExperimentSync } from './runExperiment'
import { dataset } from './testData'

describe('重排', () => {
  it('permute:每行恰好一次,且每个原始块在新序列里仍是连续一段', () => {
    const n = 1003
    const block = 50
    const idx = permutedBlocks(n, block, worldRandom(1, 0))
    expect([...idx].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i))
    const position = new Int32Array(n)
    idx.forEach((row, at) => (position[row] = at))
    for (let start = 0; start < n; start += block) {
      const end = Math.min(start + block, n)
      for (let r = start + 1; r < end; r++) expect(position[r]).toBe(position[start] + (r - start))
    }
    expect([...idx]).not.toEqual(Array.from({ length: n }, (_, i) => i))
  })

  it('stationary:平均块长接近设定值', () => {
    const n = 200_000
    const idx = stationaryBootstrap(n, 20, worldRandom(2, 0))
    let breaks = 1
    for (let t = 1; t < n; t++) if (idx[t] !== (idx[t - 1] + 1) % n) breaks++
    expect(n / breaks).toBeGreaterThan(19.4)
    expect(n / breaks).toBeLessThan(20.6)
  })

  it('同一 (seed, world) 抽出同一序列,不同世界不同', () => {
    const a = permutedBlocks(500, 7, worldRandom(42, 3))
    expect(permutedBlocks(500, 7, worldRandom(42, 3))).toEqual(a)
    expect(permutedBlocks(500, 7, worldRandom(42, 4))).not.toEqual(a)
    expect(permutedBlocks(500, 7, worldRandom(43, 3))).not.toEqual(a)
  })

  it('同一 seed 的世界与分批方式无关', () => {
    const config: ExperimentConfig = {
      method: 'stationary', block: 63, worlds: 7, seed: 9, executionLag: 1, costBps: 2.5,
      rules: [{ kind: 'gate', id: 'g', params: DEFAULT_GATE }, { kind: 'hold', id: 'h', asset: 'tqqq' }],
    }
    const whole = runExperimentSync(dataset, config, { batchSize: 7 })
    const split = runExperimentSync(dataset, config, { batchSize: 3 })
    expect(split.metrics).toEqual(whole.metrics)
    expect(split.paths).toEqual(whole.paths)
    expect(new Set(whole.metrics.g.map((x) => x.cagr)).size).toBe(7)
  })
})
