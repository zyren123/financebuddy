import { describe, expect, it } from 'vitest'
import { DEFAULT_GATE, type ExperimentConfig, type WorldBatch } from '../types'
import { BATCH_WORLDS, runBatch } from './batch'
import { runExperimentSync, runOnWorkers, workerCount, type WorkerLike } from './runExperiment'
import { dataset } from './testData'
import type { ToWorker } from './worker'

const config: ExperimentConfig = {
  method: 'stationary', block: 63, worlds: 60, seed: 7, executionLag: 1, costBps: 2.5,
  rules: [{ kind: 'gate', id: 'g', params: DEFAULT_GATE }, { kind: 'hold', id: 't', asset: 'tqqq' }],
}

/** 在主线程里模拟 worker;silent 的 worker 收下任务但永远不回 */
function fakeWorker(silent: boolean): WorkerLike {
  let state: ExperimentConfig | null = null
  const like: WorkerLike = {
    onMessage: null,
    onError: null,
    terminate: () => { like.onMessage = null },
    post: (message: ToWorker) => {
      if (message.type === 'init') { state = message.config; return }
      if (silent || !state) return
      const batch = runBatch(dataset, state, message.from, message.count)
      queueMicrotask(() => like.onMessage?.({ type: 'batch', batch }))
    },
  }
  return like
}

describe('runOnWorkers', () => {
  it('一个 worker 一直没有回音时,其余 worker 接手它的批次,结果与同步计算一致', async () => {
    let made = 0
    const seen: number[] = []
    const result = await runOnWorkers(dataset, config, { onBatch: (b: WorldBatch) => seen.push(b.from) }, () => fakeWorker(made++ === 0))
    const reference = runExperimentSync(dataset, config)
    expect(workerCount()).toBeGreaterThan(1)
    expect(result.metrics).toEqual(reference.metrics)
    expect(result.summary).toEqual(reference.summary)
    // 重算的批次只交付一次
    expect([...seen].sort((a, b) => a - b)).toEqual([...new Set(seen)].sort((a, b) => a - b))
    expect(seen.length).toBe(Math.ceil(config.worlds / BATCH_WORLDS))
  })
})
