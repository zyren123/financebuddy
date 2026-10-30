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

/** 调度只依赖这几个能力,测试可以换成假 worker */
export interface WorkerLike {
  post(message: ToWorker): void
  terminate(): void
  onMessage: ((message: FromWorker) => void) | null
  onError: ((message: string) => void) | null
}

function browserWorker(): WorkerLike {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  const like: WorkerLike = { post: (m) => worker.postMessage(m), terminate: () => worker.terminate(), onMessage: null, onError: null }
  worker.onmessage = (event: MessageEvent<FromWorker>) => like.onMessage?.(event.data)
  worker.onerror = (event) => like.onError?.(event.message)
  return like
}

/** 同一批最多同时派给几个 worker:队列空了以后,空闲 worker 接手还没回来的批次 */
const MAX_COPIES = 3

export function runExperiment(dataset: Dataset, config: ExperimentConfig, handlers: ExperimentHandlers = {}): Promise<ExperimentResult> {
  return runOnWorkers(dataset, config, handlers, browserWorker)
}

export function runOnWorkers(dataset: Dataset, config: ExperimentConfig, handlers: ExperimentHandlers, createWorker: () => WorkerLike): Promise<ExperimentResult> {
  const { signal } = handlers
  if (signal?.aborted) return Promise.reject(signal.reason)
  const startedAt = performance.now()
  const actual = runActual(dataset, config)
  handlers.onActual?.(actual)
  const collector = new Collector(config)
  const queue = batches(config.worlds)
  if (queue.length === 0) return Promise.resolve(collector.finish(dataset, actual, startedAt))
  const workers = Array.from({ length: Math.min(workerCount(), queue.length) }, createWorker)
  // 已派出、还没收到结果的批次 → 正在算它的 worker。某个 worker 没有回音时(加载卡住、被系统挂起),
  // 别的 worker 会在队列清空后重算同一批;世界由 (种子, 序号) 决定,先到的结果即正确结果。
  const outstanding = new Map<number, { from: number; count: number; workers: Set<WorkerLike> }>()

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
    const dispatch = (worker: WorkerLike) => {
      let next = queue.shift()
      if (next) outstanding.set(next.from, { ...next, workers: new Set([worker]) })
      else {
        const straggler = [...outstanding.values()].find((b) => !b.workers.has(worker) && b.workers.size < MAX_COPIES)
        if (!straggler) return
        straggler.workers.add(worker)
        next = straggler
      }
      worker.post({ type: 'run', from: next.from, count: next.count })
    }
    for (const worker of workers) {
      worker.onMessage = (message) => {
        // terminate() 之后已排队的消息仍可能送达
        if (done) return
        if (message.type === 'error') return fail(new Error(`平行世界计算失败:${message.message}`))
        if (outstanding.delete(message.batch.from)) {
          collector.add(message.batch)
          handlers.onBatch?.(message.batch)
        }
        if (collector.remaining === 0) {
          stop()
          resolve(collector.finish(dataset, actual, startedAt))
        } else dispatch(worker)
      }
      worker.onError = (message) => fail(new Error(`平行世界 worker 出错:${message}`))
      worker.post({ type: 'init', dataset, config })
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
