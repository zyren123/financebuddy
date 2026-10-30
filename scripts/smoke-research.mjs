// Research console browser check: admin session, research tab, featured parallel-world run.
// Run against npm run dev. Market APIs are stubbed; research data comes from public/research/.
import puppeteer from 'puppeteer-core'
import { readFile, mkdir } from 'node:fs/promises'

const url = process.env.SMOKE_URL ?? 'http://127.0.0.1:5173'
const out = process.env.RESEARCH_OUT ?? '.impeccable/review'
const layout = await readFile(new URL('../public/default-dashboard.json', import.meta.url), 'utf8')
await mkdir(out, { recursive: true })
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok: Boolean(ok) })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${JSON.stringify(detail)}` : ''}`)
}

async function open({ mobile = false, reduced = false } = {}) {
  const page = await browser.newPage()
  await page.bringToFront()
  const errors = []
  await page.setViewport(mobile ? { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { width: 1440, height: 900, deviceScaleFactor: 1 })
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }])
  await page.evaluateOnNewDocument(() => sessionStorage.setItem('financebuddy:admin-token:v1', 'research-smoke-session'))
  page.on('pageerror', (error) => errors.push(String(error)))
  // 行情接口在这里被刻意打桩为 503,它们的资源加载报错不算页面错误
  page.on('console', (msg) => { if (msg.type() === 'error' && !msg.text().includes('503')) errors.push(msg.text()) })
  await page.setRequestInterception(true)
  page.on('request', (request) => {
    const u = new URL(request.url())
    if (u.pathname === '/api/td') void request.respond({ status: 503, contentType: 'application/json', body: '{"status":"error"}' })
    else if (u.pathname === '/api/layout') void request.respond({ status: 200, contentType: 'application/json', body: layout })
    else if (u.pathname === '/api/market') void request.respond({ status: 503, contentType: 'application/json', body: '{}' })
    else void request.continue()
  })
  await page.goto(url, { waitUntil: 'networkidle0' })
  await page.evaluate(() => document.getElementById('dashboard-tab-research')?.click())
  await page.waitForSelector('#run-05', { timeout: 20000 })
  await page.evaluate(() => {
    const top = document.getElementById('charts').offsetTop
    window.scrollTo({ top, behavior: 'instant' })
  })
  const started = Date.now()
  try {
    await page.waitForFunction(() => [...document.querySelectorAll('#run-05 figcaption')].some((f) => f.textContent.includes('浏览器复算')), { timeout: 30000 })
  } catch (error) {
    const state = await page.evaluate(() => ({
      status: document.querySelector('#run-05 [role=status]')?.textContent,
      run: [...document.querySelectorAll('#run-05 button')].map((b) => b.textContent.trim()).find((t) => /运行|复跑|停止/.test(t)),
      top: document.getElementById('run-05')?.getBoundingClientRect().top,
      scrollY, innerHeight, hidden: document.hidden,
    }))
    throw new Error(`RUN 05 没有跑完:${JSON.stringify(state)} 错误:${errors.join(' | ')}`, { cause: error })
  }
  const runMs = Date.now() - started
  await wait(1400)
  return { page, errors, runMs }
}

try {
  const desktop = await open()
  check('featured run completes in browser', true, { ms: desktop.runMs })
  check('desktop has no horizontal overflow', await desktop.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await desktop.page.screenshot({ path: `${out}/desktop-first.png` })
  await desktop.page.screenshot({ path: `${out}/desktop.png`, fullPage: true })
  // 后台页签的定时器与 IntersectionObserver 会被节流,每个视口用完即关
  await desktop.page.close()
  const mobile = await open({ mobile: true })
  check('mobile has no horizontal overflow', await mobile.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), await mobile.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth })))
  await mobile.page.screenshot({ path: `${out}/mobile-first.png` })
  await mobile.page.screenshot({ path: `${out}/mobile.png`, fullPage: true })
  await mobile.page.close()
  const reduced = await open({ reduced: true })
  check('reduced motion run completes', true, { ms: reduced.runMs })
  for (const [name, s] of [['desktop', desktop], ['mobile', mobile], ['reduced', reduced]]) check(`${name} has no page errors`, s.errors.length === 0, s.errors.slice(0, 3))
} finally {
  await browser.close()
}
if (results.some((r) => !r.ok)) process.exit(1)
