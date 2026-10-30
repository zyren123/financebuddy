import { useCallback, useEffect, useRef, useState } from 'react'
import { loadDataset } from '../engine/loadDataset'
import { pathDates } from '../engine/world'
import { runExperiment } from '../engine/runExperiment'
import { pairedWins, summarize } from '../engine/summary'
import type { Dataset, ExperimentConfig, Metrics, PairedWins, RuleSummary } from '../types'

export type RunStatus = 'idle' | 'loading' | 'running' | 'done' | 'error' | 'cancelled'

export interface LiveRunView {
  status: RunStatus
  done: number
  total: number
  error: string | null
  config: ExperimentConfig | null
  /** 运行时每条规则的颜色槽,结果跟随运行时的快照,不跟草稿走 */
  slots: Record<string, number>
  actual: Record<string, Metrics & { path: Float32Array }> | null
  metrics: Record<string, Metrics[]>
  paths: Record<string, Float32Array[]>
  dates: string[]
  summary: RuleSummary[]
  paired: PairedWins | null
  elapsedMs: number
  /** 每次刷新递增,图表据此增量重绘 */
  version: number
}

const EMPTY: LiveRunView = { status: 'idle', done: 0, total: 0, error: null, config: null, slots: {}, actual: null, metrics: {}, paths: {}, dates: [], summary: [], paired: null, elapsedMs: 0, version: 0 }
const FLUSH_MS = 120

let datasetPromise: Promise<Dataset> | null = null
function dataset(): Promise<Dataset> {
  const pending = datasetPromise ?? loadDataset().catch((error: unknown) => { datasetPromise = null; throw error })
  datasetPromise = pending
  return pending
}

/** 浏览器里跑一组平行世界:批次流入可变缓冲区,按节流间隔把快照交给 React */
export function useLiveRun() {
  const [view, setView] = useState<LiveRunView>(EMPTY)
  const live = useRef<LiveRunView>(EMPTY)
  const abort = useRef<AbortController | null>(null)
  const flushTimer = useRef(0)
  const started = useRef(0)

  const flush = useCallback((final = false) => {
    clearTimeout(flushTimer.current)
    flushTimer.current = 0
    const cur = live.current
    const summary = cur.done > 0 && cur.actual ? summarize(cur.metrics, cur.actual) : []
    live.current = { ...cur, summary, paired: final && cur.actual ? pairedWins(cur.metrics) : cur.paired, elapsedMs: performance.now() - started.current, version: cur.version + 1 }
    setView(live.current)
  }, [])

  const schedule = useCallback(() => {
    if (!flushTimer.current) flushTimer.current = window.setTimeout(() => flush(), FLUSH_MS)
  }, [flush])

  const stop = useCallback(() => {
    abort.current?.abort()
  }, [])

  const start = useCallback(async (config: ExperimentConfig, slots: Record<string, number>) => {
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    started.current = performance.now()
    const metrics = Object.fromEntries(config.rules.map((r) => [r.id, [] as Metrics[]]))
    const paths = Object.fromEntries(config.rules.map((r) => [r.id, [] as Float32Array[]]))
    live.current = { ...EMPTY, status: 'loading', total: config.worlds, config, slots, metrics, paths, version: live.current.version + 1 }
    setView(live.current)
    try {
      const data = await dataset()
      if (controller.signal.aborted) throw new DOMException('aborted', 'AbortError')
      live.current = { ...live.current, status: 'running', dates: pathDates(data, config.executionLag) }
      setView(live.current)
      const result = await runExperiment(data, config, {
        signal: controller.signal,
        onActual: (actual) => { live.current = { ...live.current, actual }; schedule() },
        onBatch: (batch) => {
          for (const rule of config.rules) {
            live.current.metrics[rule.id].push(...batch.metrics[rule.id])
            live.current.paths[rule.id].push(...batch.paths[rule.id])
          }
          live.current = { ...live.current, done: live.current.done + batch.count }
          schedule()
        },
      })
      if (abort.current !== controller) return
      live.current = { ...live.current, status: 'done', done: config.worlds, actual: result.actual, metrics: result.metrics, paths: result.paths, dates: result.pathDates }
      flush(true)
    } catch (error) {
      if (abort.current !== controller) return
      const aborted = controller.signal.aborted
      live.current = { ...live.current, status: aborted ? 'cancelled' : 'error', error: aborted ? null : error instanceof Error ? error.message : '回测没有完成' }
      flush(aborted)
    }
  }, [flush, schedule])

  useEffect(() => () => { abort.current?.abort(); clearTimeout(flushTimer.current) }, [])

  return { view, start, stop }
}
