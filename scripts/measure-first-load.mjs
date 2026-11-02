// 全新浏览器 profile 首次打开的耗时。先 npm run dev,或用 MEASURE_URL 指向线上;RUNS 控制轮数。
// 不拦截 /api,量的是真实转发链路。
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.MEASURE_URL ?? 'http://localhost:5173'
const RUNS = Number(process.env.RUNS ?? 3)
// dev 的模块图是几十个串行请求,给每个请求加延迟后 JS 晚于读数到达,接近线上的先后顺序
const LATENCY_MS = Number(process.env.LATENCY_MS ?? 0)

const MARKS = () => {
  const marks = {}
  const conditions = {
    coverNumbers: () => document.querySelectorAll('ol[aria-label="当前读数"] li').length > 0,
    firstChart: () => document.querySelector('.react-grid-item canvas') !== null,
    marketNumbers: () => {
      const panel = document.querySelector('#dashboard-panel-market')
      return !!panel && panel.querySelector('table') !== null && !panel.innerText.includes('正在读取')
    },
  }
  const loadingShown = () =>
    ['section[aria-labelledby="cover-title"]', '#dashboard-panel-market'].some((sel) => document.querySelector(sel)?.textContent.includes('正在读取'))
  const tick = () => {
    for (const [name, ok] of Object.entries(conditions)) {
      if (marks[name] === undefined && ok()) marks[name] = Math.round(performance.now())
    }
    if (marks.loadingSeen === undefined && loadingShown()) marks.loadingSeen = Math.round(performance.now())
  }
  new MutationObserver(tick).observe(document, { subtree: true, childList: true, characterData: true })
  window.__marks = marks
}

const percentile = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]

const runs = []
for (let i = 0; i < RUNS; i++) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  await page.evaluateOnNewDocument(MARKS)
  if (LATENCY_MS > 0) await page.emulateNetworkConditions({ download: -1, upload: -1, latency: LATENCY_MS })
  const readingsRequests = []
  page.on('request', (req) => {
    if (new globalThis.URL(req.url()).pathname === '/api/readings') readingsRequests.push(req.resourceType())
  })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__marks.coverNumbers !== undefined, { timeout: 120_000 })
  const clickAt = await page.evaluate(() => {
    document.querySelector('#dashboard-tab-market').click()
    return Math.round(performance.now())
  })
  await page.waitForFunction(() => window.__marks.marketNumbers !== undefined, { timeout: 120_000 })
  await page.waitForFunction(() => window.__marks.firstChart !== undefined, { timeout: 120_000 }).catch(() => {})
  const result = await page.evaluate(() => ({
    marks: window.__marks,
    api: performance
      .getEntriesByType('resource')
      .filter((e) => new URL(e.name).pathname.startsWith('/api/'))
      .map((e) => {
        const u = new URL(e.name)
        const label = u.searchParams.get('symbol') ?? u.searchParams.get('feed') ?? u.pathname
        return { label, start: Math.round(e.startTime), ms: Math.round(e.duration), bytes: e.transferSize, decoded: e.decodedBodySize }
      }),
  }))
  const roc = await page.evaluate(async () => {
    const { ratioRoc } = await import('/src/indicators/ratio.ts')
    const { ensureBars } = await import('/src/data/barsStore.ts')
    const [qqq, vtv, schd, cgdv] = await Promise.all(['QQQ', 'VTV', 'SCHD', 'CGDV'].map((s) => ensureBars(s, '1day')))
    const t0 = performance.now()
    for (const num of [vtv, schd, cgdv]) ratioRoc(num, qqq, 35)
    return Math.round((performance.now() - t0) * 100) / 100
  }).catch(() => 'n/a (needs dev server sources)')
  runs.push({ ...result, clickAt, rocMs: roc, readingsRequests })
  await browser.close()
}

for (const [i, r] of runs.entries()) {
  console.log(`\n# run ${i + 1}`)
  for (const a of r.api) console.log(`  ${a.label.padEnd(12)} start=${a.start}ms  dur=${a.ms}ms  wire=${a.bytes}B  body=${a.decoded}B`)
  console.log(`  cover numbers at ${r.marks.coverNumbers}ms, first chart at ${r.marks.firstChart}ms`)
  console.log(`  market tab clicked at ${r.clickAt}ms, numbers at ${r.marks.marketNumbers}ms (wait ${r.marks.marketNumbers - r.clickAt}ms)`)
  console.log(`  ratioRoc x3 on full history: ${r.rocMs}ms`)
  console.log(`  /api/readings network requests: ${r.readingsRequests.length} (${r.readingsRequests.join(', ')})`)
  console.log(`  "正在读取" in cover/market: ${r.marks.loadingSeen === undefined ? 'never' : `at ${r.marks.loadingSeen}ms`}`)
}
const cover = runs.map((r) => r.marks.coverNumbers)
const market = runs.map((r) => r.marks.marketNumbers - r.clickAt)
console.log(`\ncover numbers median=${percentile(cover, 0.5)}ms max=${Math.max(...cover)}ms`)
console.log(`readings requests per page: ${runs.map((r) => r.readingsRequests.length).join(', ')}`)
console.log(`"正在读取" appeared in ${runs.filter((r) => r.marks.loadingSeen !== undefined).length}/${runs.length} runs`)
console.log(`market wait after click median=${percentile(market, 0.5)}ms max=${Math.max(...market)}ms`)
