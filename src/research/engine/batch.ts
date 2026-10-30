/** worker 与同步路径共用的分批运行与结果汇集 */
import type { Dataset, ExperimentConfig, ExperimentResult, Metrics, WorldBatch } from '../types'
import { permutedBlocks, stationaryBootstrap, worldRandom } from './resample'
import { pairedWins, summarize } from './summary'
import { pathDates, runWorld } from './world'

/** 每批世界数:够小以便尽早出图,够大以摊薄 postMessage 开销 */
export const BATCH_WORLDS = 8

export function worldIndex(dataset: Dataset, config: ExperimentConfig, world: number): Int32Array {
  const draw = config.method === 'permute' ? permutedBlocks : stationaryBootstrap
  return draw(dataset.dates.length, config.block, worldRandom(config.seed, world))
}

export function runActual(dataset: Dataset, config: ExperimentConfig): ExperimentResult['actual'] {
  const out: ExperimentResult['actual'] = {}
  for (const [id, r] of Object.entries(runWorld(dataset, null, config.rules, config.executionLag, config.costBps))) {
    out[id] = { ...r.metrics, path: r.path }
  }
  return out
}

export function runBatch(dataset: Dataset, config: ExperimentConfig, from: number, count: number): WorldBatch {
  const batch: WorldBatch = { from, count, metrics: {}, paths: {} }
  for (const rule of config.rules) {
    batch.metrics[rule.id] = []
    batch.paths[rule.id] = []
  }
  for (let w = from; w < from + count; w++) {
    const world = runWorld(dataset, worldIndex(dataset, config, w), config.rules, config.executionLag, config.costBps)
    for (const rule of config.rules) {
      batch.metrics[rule.id].push(world[rule.id].metrics)
      batch.paths[rule.id].push(world[rule.id].path)
    }
  }
  return batch
}

/** 批次可乱序到达,按 from 落位 */
export class Collector {
  readonly config: ExperimentConfig
  readonly metrics: Record<string, Metrics[]> = {}
  readonly paths: Record<string, Float32Array[]> = {}
  remaining: number

  constructor(config: ExperimentConfig) {
    this.config = config
    this.remaining = config.worlds
    for (const rule of config.rules) {
      this.metrics[rule.id] = new Array(config.worlds)
      this.paths[rule.id] = new Array(config.worlds)
    }
  }

  add(batch: WorldBatch) {
    for (const rule of this.config.rules) {
      for (let k = 0; k < batch.count; k++) {
        this.metrics[rule.id][batch.from + k] = batch.metrics[rule.id][k]
        this.paths[rule.id][batch.from + k] = batch.paths[rule.id][k]
      }
    }
    this.remaining -= batch.count
  }

  finish(dataset: Dataset, actual: ExperimentResult['actual'], startedAt: number): ExperimentResult {
    return {
      config: this.config,
      actual,
      metrics: this.metrics,
      paths: this.paths,
      pathDates: pathDates(dataset, this.config.executionLag),
      summary: summarize(this.metrics, actual),
      paired: pairedWins(this.metrics),
      elapsedMs: performance.now() - startedAt,
    }
  }
}

export function batches(worlds: number, size = BATCH_WORLDS): { from: number; count: number }[] {
  const out = []
  for (let from = 0; from < worlds; from += size) out.push({ from, count: Math.min(size, worlds - from) })
  return out
}
