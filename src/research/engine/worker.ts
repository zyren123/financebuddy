/** 平行世界 worker:收一次数据集,之后按主线程派发的区间逐批回传(路径缓冲区转移而非复制) */
import type { Dataset, ExperimentConfig, WorldBatch } from '../types'
import { runBatch } from './batch'

export type ToWorker =
  | { type: 'init'; dataset: Dataset; config: ExperimentConfig }
  | { type: 'run'; from: number; count: number }

export type FromWorker = { type: 'batch'; batch: WorldBatch } | { type: 'error'; message: string }

// 不引 webworker lib:它是全局声明,会污染整个 src 的 DOM 类型
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null
  postMessage(message: FromWorker, transfer?: Transferable[]): void
}
let state: { dataset: Dataset; config: ExperimentConfig } | null = null

scope.onmessage = (event: MessageEvent<ToWorker>) => {
  const message = event.data
  if (message.type === 'init') {
    state = { dataset: message.dataset, config: message.config }
    return
  }
  try {
    if (!state) throw new Error('worker 未初始化')
    const batch = runBatch(state.dataset, state.config, message.from, message.count)
    const transfer = Object.values(batch.paths).flatMap((paths) => paths.map((p) => p.buffer))
    scope.postMessage({ type: 'batch', batch }, transfer)
  } catch (error) {
    scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
