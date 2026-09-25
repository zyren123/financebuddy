// 端到端冒烟:用系统 Chrome 驱动真实页面(本机 Playwright 自带 chromium 损坏,见交接记录)
// 前置:npm run dev 已在 http://localhost:5173 运行
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173'
const OUT = process.env.SMOKE_OUT ?? '/tmp/financebuddy-smoke'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 1000 })

const jsErrors = []
page.on('pageerror', (e) => jsErrors.push(`pageerror: ${e}`))
page.on('console', (m) => {
  if (m.type() === 'error') jsErrors.push(`console.error: ${m.text()}`)
})
page.on('dialog', (d) => d.accept())

try {
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 90_000 })

  // 等待图表真正画出来(首屏 4 个 symbol 走限速队列)
  await page.waitForSelector('canvas', { timeout: 90_000 })
  await sleep(3000)

  const body = await page.evaluate(() => document.body.innerText)
  check('页面标题', body.includes('FinanceBuddy'))
  check('Ratio ROC 图例(VTV/QQQ)', body.includes('VTV/QQQ'))
  check('RSI 指标卡', body.includes('RSI(14)'))
  check('K 线读数(OHLC)', /O\s+[\d.]+/.test(body))

  const gridItems = await page.$$eval('.react-grid-item', (els) => els.length)
  const canvases = await page.$$eval('canvas', (els) => els.length)
  check('3 张卡片', gridItems === 3, `react-grid-item=${gridItems}`)
  check('图表 canvas ≥ 3', canvases >= 3, `canvas=${canvases}`)

  const persisted = await page.evaluate(() => localStorage.getItem('financebuddy:dashboard:v1'))
  check('Local Layout 已持久化', persisted != null && persisted.includes('qqq-candle'))
  await page.screenshot({ path: `${OUT}-1-view.png` })

  // ---- 编辑模式(快捷键 E)----
  await page.keyboard.press('e')
  await sleep(400)
  const hasHandles = await page.$$eval('.react-resizable-handle', (els) => els.length)
  check('编辑模式出现缩放手柄', hasHandles >= 3, `handles=${hasHandles}`)
  await page.screenshot({ path: `${OUT}-2-edit.png` })

  // ---- 预设:自上而下 ----
  const flowBtn = await page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find((b) => b.textContent === '自上而下'),
  )
  await flowBtn.asElement().click()
  await sleep(500)
  const widths = await page.$$eval('.react-grid-item', (els) =>
    els.map((el) => Math.round(el.getBoundingClientRect().width)),
  )
  check('flow 预设:卡片等宽铺满', widths.length === 3 && widths.every((w) => w > 700), widths.join(','))
  await page.screenshot({ path: `${OUT}-3-flow.png` })

  // ---- 加一张指标卡 ----
  const addBtn = await page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find((b) => b.textContent === '+ 指标卡'),
  )
  await addBtn.asElement().click()
  await sleep(400)
  const gridItems4 = await page.$$eval('.react-grid-item', (els) => els.length)
  check('添加卡片 → 4 张', gridItems4 === 4, `react-grid-item=${gridItems4}`)

  // ---- 刷新:Local Layout 恢复、编辑态退出 ----
  await page.reload({ waitUntil: 'networkidle2' })
  await page.waitForSelector('.react-grid-item', { timeout: 60_000 })
  const gridItemsAfter = await page.$$eval('.react-grid-item', (els) => els.length)
  check('刷新后布局恢复(4 张)', gridItemsAfter === 4, `react-grid-item=${gridItemsAfter}`)
  const visibleHandles = await page.$$eval(
    '.react-resizable-handle',
    (els) => els.filter((el) => getComputedStyle(el).display !== 'none').length,
  )
  check('刷新后回到浏览模式(手柄隐藏)', visibleHandles === 0, `visible=${visibleHandles}`)

  // ---- 重置为默认(Published Layout)----
  await page.keyboard.press('e')
  await sleep(300)
  const resetBtn = await page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find((b) => b.textContent === '重置为默认'),
  )
  await resetBtn.asElement().click()
  await sleep(600)
  const gridItemsReset = await page.$$eval('.react-grid-item', (els) => els.length)
  check('重置后回到 3 张默认卡', gridItemsReset === 3, `react-grid-item=${gridItemsReset}`)

  check('无 JS 错误', jsErrors.length === 0, jsErrors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} 项通过`)
process.exit(failed.length > 0 ? 1 : 0)
