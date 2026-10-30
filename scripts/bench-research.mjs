// 在真实浏览器里跑研究引擎的 worker 路径:与同步结果逐位比较、测 ms/world、验证中止。
// 自带一个无插件的 Vite dev server(缓存放 /tmp),不依赖 npm run dev。
import puppeteer from 'puppeteer-core'
import { createServer } from 'vite'

const port = Number(process.env.BENCH_PORT ?? 5199)
const worlds = Number(process.env.BENCH_WORLDS ?? 500)
const server = await createServer({
  configFile: false,
  root: new URL('..', import.meta.url).pathname,
  cacheDir: '/tmp/financebuddy-bench-vite',
  logLevel: 'error',
  server: { port, strictPort: true, host: '127.0.0.1' },
})
await server.listen()
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
let failed = false
try {
  const page = await browser.newPage()
  page.on('pageerror', (error) => console.error('pageerror', error))
  await page.goto(`http://127.0.0.1:${port}/research/dataset.json`)
  const report = await page.evaluate(async (worlds) => {
    const { runExperiment, runExperimentSync, workerCount } = await import('/src/research/engine/runExperiment.ts')
    const { loadDataset } = await import('/src/research/engine/loadDataset.ts')
    const { DEFAULT_GATE } = await import('/src/research/types.ts')
    const dataset = await loadDataset()
    const rules = [
      { kind: 'gate', id: 'three_gate_default', params: DEFAULT_GATE },
      { kind: 'gate', id: 'three_gate_confirmation_days=1', params: { ...DEFAULT_GATE, confirmationDays: 1 } },
      { kind: 'sma', id: 'sma200_+4/-3_qqq', basis: 'qqq', window: 200, enter: 0.04, exit: 0.03 },
      { kind: 'sma', id: 'sma200_+4/-3_spy', basis: 'spy', window: 200, enter: 0.04, exit: 0.03 },
      { kind: 'hold', id: 'tqqq_hold', asset: 'tqqq' },
      { kind: 'hold', id: 'qqq_hold', asset: 'qqq' },
    ]
    const config = (n) => ({ method: 'stationary', block: 63, worlds: n, seed: 7, rules, executionLag: 1, costBps: 2.5 })
    const sameAs = (a, b) => JSON.stringify(a.metrics) === JSON.stringify(b.metrics)
      && rules.every((r) => a.paths[r.id].every((p, i) => p.every((v, k) => v === b.paths[r.id][i][k])))

    const small = config(40)
    const viaWorkers = await runExperiment(dataset, small)
    const equal = sameAs(viaWorkers, runExperimentSync(dataset, small))

    const order = []
    const t0 = performance.now()
    const result = await runExperiment(dataset, config(worlds), { onActual: () => order.push('actual'), onBatch: (b) => order.push(b.from) })
    const workerMs = performance.now() - t0
    const t1 = performance.now()
    runExperimentSync(dataset, config(100))
    const syncMs = (performance.now() - t1) / 100

    const controller = new AbortController()
    let after = 0
    const aborted = await runExperiment(dataset, config(400), {
      signal: controller.signal,
      onBatch: () => (controller.signal.aborted ? after++ : controller.abort(new DOMException('stop', 'AbortError'))),
    }).then(() => 'resolved', (e) => e.name)
    await new Promise((r) => setTimeout(r, 300))
    return {
      workers: workerCount(), cores: navigator.hardwareConcurrency, equal, firstEvent: order[0], batches: order.length - 1,
      outOfOrder: order.slice(1).some((f, i, a) => i > 0 && f < a[i - 1]), workerMsPerWorld: workerMs / worlds,
      syncMsPerWorld: syncMs, aborted, batchesAfterAbort: after, summaryRules: result.summary.length,
    }
  }, worlds)
  console.log(JSON.stringify(report, null, 2))
  failed = !report.equal || report.firstEvent !== 'actual' || report.aborted !== 'AbortError' || report.batchesAfterAbort !== 0
} finally {
  await browser.close()
  await server.close()
}
process.exit(failed ? 1 : 0)
