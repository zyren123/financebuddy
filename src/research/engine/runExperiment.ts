/**
 * 平行世界实验入口。真实顺序先在主线程跑完(几毫秒)并回调,再把世界按批派给 worker;
 * 每个 worker 一次只领一批,做完再领,快慢不均时自动均衡。中止即终止全部 worker。
 */
import type { Dataset, ExperimentConfig, ExperimentResult, WorldBatch } from '../types'
import { batches, Collector, runActual, runBatch } from './batch'
import type { FromWorker, ToWorker } from './worker'

export interface ExperimentHandlers {
  onBatch?: (batch: WorldBatch) => void
  onActual?: (actual: ExperimentResult['actual']) => void
  signal?: AbortSignal
}

export function workerCount(): number {
  return Math.max(1, Math.min((navigator.hardwareConcurrency || 2) - 1, 6))
}

export function runExperiment(dataset: Dataset, config: ExperimentConfig, handlers: ExperimentHandlers = {}): Promise<ExperimentResult> {
  const { signal } = handlers
  if (signal?.aborted) return Promise.reject(signal.reason)
  const startedAt = performance.now()
  const actual = runActual(dataset, config)
  handlers.onActual?.(actual)
  const collector = new Collector(config)
  const queue = batches(config.worlds)
  if (queue.length === 0) return Promise.resolve(collector.finish(dataset, actual, startedAt))
  const workers = Array.from({ length: Math.min(workerCount(), queue.length) },
    () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }))

  return new Promise<ExperimentResult>((resolve, reject) => {
    let done = false
    const stop = () => {
      done = true
      for (const w of workers) w.terminate()
      signal?.removeEventListener('abort', onAbort)
    }
    const fail = (error: unknown) => {
      stop()
      reject(error)
    }
    const onAbort = () => fail(signal?.reason)
    signal?.addEventListener('abort', onAbort, { once: true })
    const dispatch = (worker: Worker) => {
      const next = queue.shift()
      if (next) worker.postMessage({ type: 'run', ...next } satisfies ToWorker)
    }
    for (const worker of workers) {
      worker.onmessage = (event: MessageEvent<FromWorker>) => {
        // terminate() 之后已排队的消息仍可能送达
        if (done) return
        const message = event.data
        if (message.type === 'error') return fail(new Error(`平行世界计算失败:${message.message}`))
        collector.add(message.batch)
        handlers.onBatch?.(message.batch)
        if (collector.remaining === 0) {
          stop()
          resolve(collector.finish(dataset, actual, startedAt))
        } else dispatch(worker)
      }
      worker.onerror = (event) => fail(new Error(`平行世界 worker 出错:${event.message}`))
      worker.postMessage({ type: 'init', dataset, config } satisfies ToWorker)
      dispatch(worker)
    }
  })
}

/** 无 worker 的同一计算;batchSize 只影响回调粒度,不影响结果 */
export function runExperimentSync(dataset: Dataset, config: ExperimentConfig,
  handlers: Omit<ExperimentHandlers, 'signal'> & { batchSize?: number } = {}): ExperimentResult {
  const startedAt = performance.now()
  const actual = runActual(dataset, config)
  handlers.onActual?.(actual)
  const collector = new Collector(config)
  for (const { from, count } of batches(config.worlds, handlers.batchSize)) {
    const batch = runBatch(dataset, config, from, count)
    collector.add(batch)
    handlers.onBatch?.(batch)
  }
  return collector.finish(dataset, actual, startedAt)
}
