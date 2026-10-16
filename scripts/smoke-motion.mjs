// Deterministic browser checks. All financial/API responses are isolated test fixtures.
// Run against npm run dev; no layout is published and no market credits are consumed.
import puppeteer from 'puppeteer-core'
import { readFile, mkdir, writeFile } from 'node:fs/promises'

const url = process.env.SMOKE_URL ?? 'http://127.0.0.1:5173'
const out = process.env.MOTION_OUT ?? '/tmp/financebuddy-motion'
const layout = await readFile(new URL('../public/default-dashboard.json', import.meta.url), 'utf8')
await mkdir(out, { recursive: true })
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const results = []
const errors = []
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const check = (name, ok, detail) => {
  results.push({ name, ok: Boolean(ok), detail })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${JSON.stringify(detail)}` : ''}`)
}
const clickText = async (page, text) => {
  const el = await page.evaluateHandle((label) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label), text)
  await el.asElement().click()
  await el.dispose()
}
async function open({ mobile = false, reduced = false, admin = false } = {}) {
  const page = await browser.newPage()
  await page.setViewport(mobile ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1440, height: 1000 })
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }])
  if (admin) await page.evaluateOnNewDocument(() => sessionStorage.setItem('financebuddy:admin-token:v1', 'motion-test-session'))
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.setRequestInterception(true)
  page.on('request', (request) => {
    const u = new URL(request.url())
    if (u.pathname === '/api/td') {
      const seed = { QQQ: 0, VTV: 1, SCHD: 2, CGDV: 3 }[u.searchParams.get('symbol')] ?? 4
      const values = Array.from({ length: 900 }, (_, i) => {
        const c = 200 + i * (0.01 + seed * 0.012) + Math.sin(i / (14 + seed * 3) + seed) * (8 + seed * 2)
        return { datetime: new Date(Date.UTC(2026, 9, 15) - i * 86400000).toISOString().slice(0, 10), open: String(c - 0.5), high: String(c + 2), low: String(c - 2), close: String(c), volume: '10000' }
      })
      void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ meta: {}, status: 'ok', values }) })
    } else if (u.pathname === '/api/layout') {
      void request.respond({ status: request.method() === 'GET' ? 200 : 405, contentType: 'application/json', body: layout })
    } else if (u.pathname === '/api/market') {
      void request.respond({ status: 503, contentType: 'application/json', body: '{}' })
    } else void request.continue()
  })
  await page.goto(url, { waitUntil: 'networkidle0' })
  await page.waitForSelector('.detector.fired .detector-control')
  await wait(1000)
  return page
}

try {
  const desktop = await open({ admin: true })
  const mobile = await open({ mobile: true })
  check('desktop/mobile have no horizontal overflow', await desktop.evaluate(() => document.documentElement.scrollWidth === innerWidth) && await mobile.evaluate(() => document.documentElement.scrollWidth === innerWidth))
  const cta = await mobile.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('进入图表')).getBoundingClientRect()
    return { top: b.top, bottom: b.bottom, viewport: innerHeight }
  })
  check('390×844 CTA remains in first viewport', cta.bottom <= cta.viewport, cta)
  await desktop.screenshot({ path: `${out}/desktop.png` })
  await mobile.screenshot({ path: `${out}/mobile.png` })
  await desktop.bringToFront()
  check('one SVG owns the cover and header states', await desktop.evaluate(() => {
    window.motionScene = document.querySelector('.detector')
    return document.querySelectorAll('.detector').length === 1
  }))

  const hover = await desktop.$('.detector-control circle')
  const bounds = await hover.boundingBox()
  await desktop.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await wait(650)
  check('node expands into a readout', await desktop.$eval('.detector-series', (el) => Number(el.querySelector('.detector-arrival > circle').getAttribute('r')) > 11.9 && Number(el.querySelector('.detector-arrival > g').getAttribute('opacity')) > 0.99))
  await desktop.screenshot({ path: `${out}/node-readout.png` })
  await desktop.mouse.down()
  await wait(100)
  const compressed = await desktop.$eval('.detector-arrival > circle', (el) => Number(el.getAttribute('r')))
  await desktop.screenshot({ path: `${out}/node-pressed.png` })
  await desktop.mouse.up()
  const release = await desktop.evaluate(async () => {
    const node = document.querySelector('.detector-arrival > circle')
    const radii = []
    for (let i = 0; i < 40; i++) {
      await new Promise(requestAnimationFrame)
      radii.push(Number(node.getAttribute('r')))
    }
    return { maximum: Math.max(...radii), final: radii.at(-1), selected: document.querySelector('.detector-control').getAttribute('aria-pressed') }
  })
  check('press compresses the node and release has a bounded spring return', compressed < 11.5 && release.maximum > 12.03 && release.maximum < 12.5 && Math.abs(release.final - 12) < 0.02 && release.selected === 'true', { compressed, ...release })
  await desktop.mouse.move(30, 30)
  await wait(650)
  check('node collapses to the original circle', await desktop.$eval('.detector-series', (el) => Math.abs(Number(el.querySelector('.detector-arrival > circle').getAttribute('r')) - 9) < 0.01))
  await desktop.$eval('.detector-control', (el) => el.focus())
  await desktop.keyboard.press('Escape')
  check('keyboard Escape clears selection', await desktop.$eval('.detector-control', (el) => el.getAttribute('aria-pressed') === 'false'))
  await desktop.evaluate(() => document.activeElement.blur())

  await desktop.evaluate(() => window.scrollTo(0, document.querySelector('#charts').offsetTop * 0.6))
  await wait(110)
  await desktop.screenshot({ path: `${out}/desktop-transit.png` })
  const reverse = await desktop.evaluate(async () => {
    const scene = document.querySelector('.detector-scene')
    const before = scene.getBoundingClientRect()
    window.scrollTo(0, document.querySelector('#charts').offsetTop * 0.2)
    await new Promise(requestAnimationFrame)
    const after = scene.getBoundingClientRect()
    return { same: window.motionScene === document.querySelector('.detector'), step: Math.hypot(after.x - before.x, after.y - before.y) }
  })
  check('reversing a partial transition preserves the SVG and its current position', reverse.same && reverse.step < 80, reverse)
  await desktop.evaluate(() => window.scrollTo(0, 0))
  await wait(700)

  await clickText(desktop, '进入图表')
  await wait(1100)
  check('shared detector lands in the header', await desktop.evaluate(() => {
    const scene = document.querySelector('.detector-scene')
    const emblem = document.querySelector('a[href="#top"] > div')
    const actual = scene.getBoundingClientRect()
    const expected = emblem.getBoundingClientRect()
    return window.motionScene === document.querySelector('.detector') && scene.style.opacity === '1' && scene.inert && Math.abs(actual.x - expected.x) < 0.1 && Math.abs(actual.y - expected.y) < 0.1 && Math.abs(actual.width - expected.width) < 0.1
  }))
  await desktop.screenshot({ path: `${out}/desktop-docked.png` })
  await desktop.setViewport({ width: 1000, height: 800 })
  await wait(700)
  check('resizing keeps the same SVG aligned with the sticky header slot', await desktop.evaluate(() => {
    const a = document.querySelector('.detector-scene').getBoundingClientRect()
    const b = document.querySelector('a[href="#top"] > div').getBoundingClientRect()
    return window.motionScene === document.querySelector('.detector') && Math.hypot(a.x - b.x, a.y - b.y) < 0.1 && Math.abs(a.width - b.width) < 0.1
  }))
  await desktop.setViewport({ width: 1440, height: 1000 })
  await wait(700)
  await clickText(desktop, '编辑布局(E)')
  await wait(250)
  await desktop.evaluate(() => {
    window.motionCanvas = document.querySelectorAll('article')[1].querySelector('canvas')
    window.motionTrack = document.querySelector('.detector .track')
    window.motionStart = window.motionTrack.getAttribute('d')
    document.querySelectorAll('button[aria-label="卡片设置"]')[1].click()
  })
  await wait(600)
  check('settings preserve the original canvas instance', await desktop.evaluate(() => window.motionCanvas.isConnected))
  await desktop.screenshot({ path: `${out}/settings.png` })
  await desktop.evaluate(() => {
    const input = document.querySelectorAll('article')[1].querySelector('input[type="number"]')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '70')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const samples = await desktop.evaluate(async () => {
    const values = []
    for (let i = 0; i < 45; i++) {
      await new Promise(requestAnimationFrame)
      const d = window.motionTrack.getAttribute('d')
      const coords = d.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number)
      const node = window.motionTrack.nextElementSibling.querySelector('circle')
      values.push({ d, aligned: Math.abs(Number(node.getAttribute('cx')) - coords.at(-2)) < 0.001 && Math.abs(Number(node.getAttribute('cy')) - coords.at(-1)) < 0.001 })
    }
    return { sameNode: window.motionTrack === document.querySelector('.detector .track'), changed: values.at(-1).d !== window.motionStart, shapes: new Set(values.map((v) => v.d)).size, aligned: values.every((v) => v.aligned) }
  })
  check('period change morphs the same SVG path through intermediate shapes', samples.sameNode && samples.changed && samples.shapes > 10, samples)
  check('nodes stay exactly on the interpolated curve endpoints', samples.aligned)
  await desktop.evaluate(() => document.querySelectorAll('button[aria-label="完成卡片设置"]')[0].click())
  await wait(550)
  check('settings collapse retains chart', await desktop.evaluate(() => window.motionCanvas.isConnected))
  await clickText(desktop, '返回浏览')
  await wait(200)
  const zoom = await desktop.evaluate(async () => {
    const article = document.querySelector('article')
    const canvas = article.querySelector('canvas')
    const buttons = [...article.querySelector('[aria-label="时间区间"]').querySelectorAll('button')]
    buttons[2].click()
    await new Promise((resolve) => setTimeout(resolve, 700))
    const before = canvas.toDataURL()
    buttons[0].click()
    const images = []
    for (let i = 0; i < 20; i++) {
      await new Promise(requestAnimationFrame)
      await new Promise(requestAnimationFrame)
      images.push(canvas.toDataURL())
    }
    return { intermediateImages: new Set(images).size, changed: images.at(-1) !== before }
  })
  check('range selection visibly zooms the chart canvas through intermediate frames', zoom.intermediateImages >= 6 && zoom.changed, zoom)
  const rapid = await desktop.evaluate(async () => {
    const group = document.querySelector('[aria-label="时间区间"]')
    const buttons = [...group.querySelectorAll('button')]
    const intervals = []
    let prev = performance.now()
    const record = (now) => { intervals.push(now - prev); prev = now }
    for (let i = 0; i < 50; i++) {
      if (i % 3 === 0) buttons[(i / 3 | 0) % buttons.length].click()
      await new Promise((resolve) => requestAnimationFrame((now) => { record(now); resolve() }))
    }
    buttons[2].click()
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const line = group.querySelector('.selection-indicator')
    const transform = new DOMMatrix(getComputedStyle(line).transform)
    return { selected: buttons[2].getAttribute('aria-pressed'), indicatorX: transform.m41, expectedX: buttons[2].offsetLeft, p95: intervals.sort((a, b) => a - b)[Math.floor(intervals.length * 0.95)], frames: intervals.length }
  })
  check('rapid range changes settle on the last selection', rapid.selected === 'true' && Math.abs(rapid.indicatorX - rapid.expectedX) < 0.1, rapid)
  await desktop.evaluate(() => document.querySelector('a[href="#top"]').click())
  await wait(1100)
  check('reverse shared transition returns the original SVG to its cover slot', await desktop.evaluate(() => {
    const actual = document.querySelector('.detector-scene').getBoundingClientRect()
    const expected = document.querySelector('#top figure > div').getBoundingClientRect()
    return scrollY === 0 && window.motionScene === document.querySelector('.detector') && Math.hypot(actual.x - expected.x, actual.y - expected.y) < 0.1 && Math.abs(actual.width - expected.width) < 0.1
  }))

  const touchNode = await mobile.$('.detector-control circle')
  await mobile.bringToFront()
  await touchNode.tap()
  await wait(650)
  check('touch selects a node', await mobile.$eval('.detector-control', (el) => el.getAttribute('aria-pressed') === 'true'))
  await mobile.screenshot({ path: `${out}/mobile-readout.png` })
  await touchNode.tap()
  await wait(650)
  check('second touch collapses the node', await mobile.$eval('.detector-control', (el) => el.getAttribute('aria-pressed') === 'false'))
  const touchBounds = await touchNode.boundingBox()
  const touchX = touchBounds.x + touchBounds.width / 2
  const touchY = touchBounds.y + touchBounds.height / 2
  await mobile.touchscreen.touchStart(touchX, touchY)
  await wait(100)
  check('touch receives pressure feedback before selection', await mobile.$eval('.detector-arrival > circle', (el) => Number(el.getAttribute('r')) < 8.7))
  await mobile.touchscreen.touchMove(touchX, touchY - 90)
  await mobile.touchscreen.touchEnd()
  await wait(650)
  check('vertical touch movement scrolls the page and cancels node activation', await mobile.evaluate(() => scrollY > 0 && document.querySelector('.detector-control').getAttribute('aria-pressed') === 'false'))
  await mobile.evaluate(() => window.scrollTo(0, 0))
  await wait(700)
  await clickText(mobile, '进入图表')
  await wait(1200)
  check('touch layout docks the original scene exactly', await mobile.evaluate(() => {
    const a = document.querySelector('.detector-scene').getBoundingClientRect()
    const b = document.querySelector('a[href="#top"] > div').getBoundingClientRect()
    return document.querySelectorAll('.detector').length === 1 && Math.hypot(a.x - b.x, a.y - b.y) < 0.1 && Math.abs(a.width - b.width) < 0.1
  }))
  await mobile.screenshot({ path: `${out}/mobile-docked.png` })

  const reduced = await open({ reduced: true })
  await reduced.$eval('.detector-control', (el) => el.focus())
  check('reduced motion settles immediately with accurate state', await reduced.$eval('.detector-series', (el) => el.querySelector('.detector-arrival > circle').getAttribute('r') === '12' && getComputedStyle(el.querySelector('.track')).transitionDuration === '0s'))
  await clickText(reduced, '进入图表')
  check('reduced motion skips spatial scroll', await reduced.evaluate(() => scrollY >= document.querySelector('#charts').offsetTop - 1))
  check('no uncaught browser errors', errors.length === 0, errors)
} finally {
  await browser.close()
  await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2))
}
const failed = results.filter((result) => !result.ok)
console.log(`${results.length - failed.length}/${results.length} checks passed; artifacts: ${out}`)
process.exitCode = failed.length ? 1 : 0
