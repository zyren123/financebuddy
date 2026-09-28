// 端到端冒烟:用系统 Chrome 驱动真实页面(本机 Playwright 自带 chromium 损坏,见交接记录)
// 前置:npm run dev 已在 http://localhost:5173 运行;可选 env ADMIN_TOKEN 覆盖 dev 缺省口令。
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173'
const OUT = process.env.SMOKE_OUT ?? '/tmp/financebuddy-smoke'
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? 'dev-admin-token' // 与 vite.config.ts 的 dev 缺省一致

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const findBtn = (page, text) =>
  page.evaluateHandle(
    (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t),
    text,
  )

const waitGrid = (page) => page.waitForSelector('.react-grid-item', { timeout: 90_000 })

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true })

const jsErrors = []
const watch = (page) => {
  const errs = []
  jsErrors.push(errs)
  page.on('pageerror', (e) => errs.push(`pageerror: ${e}`))
  page.on('console', (m) => {
    if (m.type() === 'error') {
      // 错口令测试故意触发 401,浏览器会把它记成 console.error,属预期噪音
      if (/status of 401/.test(m.text())) return
      errs.push(`console.error: ${m.text()}`)
    }
  })
  page.on('dialog', (d) => d.accept())
}

try {
  // ---- 访客视角(独立标签页 = 独立 sessionStorage)----
  const page = await browser.newPage()
  watch(page)
  await page.setViewport({ width: 1600, height: 1000 })
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 90_000 })
  try {
    await page.waitForSelector('canvas', { timeout: 90_000 })
  } catch {
    const dump = await page.evaluate(() => document.body.innerText.slice(0, 300))
    console.error('canvas 未出现,页面文本:', JSON.stringify(dump))
    console.error('JS 错误:', jsErrors.flat().slice(0, 5).join(' | '))
    throw new Error('首屏图表未渲染')
  }
  await sleep(3000)

  const body = await page.evaluate(() => document.body.innerText)
  check('页面标题', body.includes('FinanceBuddy'))
  check('Ratio ROC 图例(VTV/QQQ)', body.includes('VTV/QQQ'))
  check('RSI 指标卡', body.includes('RSI(14)'))
  check('K 线读数(OHLC)', /O\s+[\d.]+/.test(body))

  const gridItems = await page.$$eval('.react-grid-item', (els) => els.length)
  const canvases = await page.$$eval('canvas', (els) => els.length)
  check('3 张卡片(出厂种子)', gridItems === 3, `react-grid-item=${gridItems}`)
  check('图表 canvas ≥ 3', canvases >= 3, `canvas=${canvases}`)
  await page.screenshot({ path: `${OUT}-1-visitor.png` })

  // 访客只读:没有编辑按钮,旧 Local Layout 键不再写入
  const hasEditBtn = await page.evaluate(() =>
    [...document.querySelectorAll('button')].some((b) => b.textContent.includes('编辑布局')),
  )
  check('访客无编辑入口', !hasEditBtn)
  const legacyLocal = await page.evaluate(() => localStorage.getItem('financebuddy:dashboard:v1'))
  check('Local Layout 已废弃(不写 localStorage)', legacyLocal === null)

  // E 键对访客无反应(手柄元素常驻 DOM,按可见性计)
  const visibleHandles = (p) =>
    p.$$eval('.react-resizable-handle', (els) =>
      els.filter((el) => getComputedStyle(el).display !== 'none').length,
    )
  await page.keyboard.press('e')
  await sleep(400)
  const visitorHandles = await visibleHandles(page)
  check('访客按 E 不进入编辑', visitorHandles === 0, `visible handles=${visitorHandles}`)

  // Browse State:区间偏好是会话内存
  const range1y = await findBtn(page, '1年')
  await range1y.asElement().click()
  await sleep(500)
  const activeAfterClick = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '1年')
    return b?.className.includes('bg-accent') ?? false
  })
  check('Browse State:点「1年」即高亮', activeAfterClick)
  await page.reload({ waitUntil: 'networkidle2' })
  await waitGrid(page)
  await page.waitForSelector('canvas', { timeout: 90_000 })
  const activeAfterReload = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '3年')
    return b?.className.includes('bg-accent') ?? false
  })
  check('Browse State 不落盘:刷新回默认 3年', activeAfterReload)

  // ---- Admin 登录(#admin 入口)----
  await page.goto(`${URL}/#admin`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('input[type=password]', { timeout: 10_000 })
  check('#admin 弹出口令框', true)

  await page.type('input[type=password]', 'wrong-password')
  await page.keyboard.press('Enter')
  await sleep(500)
  const stillVisitor = await page.evaluate(() =>
    ![...document.querySelectorAll('button')].some((b) => b.textContent.includes('编辑布局')),
  )
  check('错口令被拒', stillVisitor)

  await page.goto(`${URL}/#admin`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('input[type=password]', { timeout: 10_000 })
  await page.type('input[type=password]', ADMIN_TOKEN)
  await page.keyboard.press('Enter')
  await sleep(500)
  const adminBtn = await page.evaluate(() =>
    [...document.querySelectorAll('button')].some((b) => b.textContent.includes('编辑布局')),
  )
  check('正确口令登录:出现编辑入口', adminBtn)
  await page.screenshot({ path: `${OUT}-2-admin.png` })

  // ---- 编辑 Draft → 发布 ----
  await page.keyboard.press('e')
  await sleep(400)
  const hasHandles = await page.$$eval(
    '.react-resizable-handle',
    (els) => els.filter((el) => getComputedStyle(el).display !== 'none').length,
  )
  check('编辑模式出现缩放手柄', hasHandles >= 3, `visible handles=${hasHandles}`)
  await page.screenshot({ path: `${OUT}-3-edit.png` })

  // 纯拖拽(不碰任何卡片参数)也要点亮「发布」——setLayout 的 dirty 回归
  // 注意:mousemove 要带间隔逐步发(同 tick 连发不会启动 react-draggable 的拖拽)
  const dragHandle = await page.$('.card-drag-handle')
  const handleBox = await dragHandle.boundingBox()
  await page.mouse.move(handleBox.x + 100, handleBox.y + 15)
  await page.mouse.down()
  for (let k = 1; k <= 8; k++) {
    await page.mouse.move(handleBox.x + 100 + k * 26, handleBox.y + 15 + k * 28)
    await sleep(60)
  }
  await page.mouse.up()
  await sleep(600)
  const publishEnabledAfterDrag = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '发布')
    return b ? !b.disabled : null
  })
  check('纯拖拽即点亮「发布」', publishEnabledAfterDrag === true, `enabled=${publishEnabledAfterDrag}`)

  const flowBtn = await findBtn(page, '自上而下')
  await flowBtn.asElement().click()
  await sleep(500)
  const widths = await page.$$eval('.react-grid-item', (els) =>
    els.map((el) => Math.round(el.getBoundingClientRect().width)),
  )
  check('flow 预设:卡片等宽铺满', widths.length === 3 && widths.every((w) => w > 700), widths.join(','))

  const addBtn = await findBtn(page, '+ 指标卡')
  await addBtn.asElement().click()
  await sleep(400)
  const gridItems4 = await page.$$eval('.react-grid-item', (els) => els.length)
  check('添加卡片 → 4 张', gridItems4 === 4, `react-grid-item=${gridItems4}`)

  const publishBtn = await findBtn(page, '发布')
  await publishBtn.asElement().click()
  await sleep(1000)
  await page.screenshot({ path: `${OUT}-4-published.png` })

  // 发布即回浏览态,且 4 张卡仍是当前视图
  const gridAfterPublish = await page.$$eval('.react-grid-item', (els) => els.length)
  check('发布后回到浏览态', gridAfterPublish === 4, `react-grid-item=${gridAfterPublish}`)

  // ---- 另一个访客(新标签页,独立 sessionStorage):发布已全局生效 ----
  const page2 = await browser.newPage()
  watch(page2)
  await page2.setViewport({ width: 1600, height: 1000 })
  await page2.goto(URL, { waitUntil: 'networkidle2', timeout: 90_000 })
  await waitGrid(page2)
  const gridItemsVisitor2 = await page2.$$eval('.react-grid-item', (els) => els.length)
  check('新访客看到已发布布局(4 张)', gridItemsVisitor2 === 4, `react-grid-item=${gridItemsVisitor2}`)
  const visitor2EditBtn = await page2.evaluate(() =>
    [...document.querySelectorAll('button')].some((b) => b.textContent.includes('编辑布局')),
  )
  check('新访客仍是只读', !visitor2EditBtn)
  await page2.close()

  // ---- 恢复上一版 ----
  await page.keyboard.press('e')
  await sleep(400)
  const restoreBtn = await findBtn(page, '恢复上一版')
  await restoreBtn.asElement().click()
  await sleep(1000)
  const gridAfterRestore = await page.$$eval('.react-grid-item', (els) => els.length)
  check('恢复上一版 → 回到 3 张', gridAfterRestore === 3, `react-grid-item=${gridAfterRestore}`)

  // 再用 page2 验证恢复也是全局的
  const page3 = await browser.newPage()
  watch(page3)
  await page3.goto(URL, { waitUntil: 'networkidle2', timeout: 90_000 })
  await waitGrid(page3)
  const gridItemsVisitor3 = await page3.$$eval('.react-grid-item', (els) => els.length)
  check('恢复对新访客同样生效(3 张)', gridItemsVisitor3 === 3, `react-grid-item=${gridItemsVisitor3}`)
  await page3.close()

  check('无 JS 错误', jsErrors.flat().length === 0, jsErrors.flat().slice(0, 3).join(' | '))
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} 项通过`)
process.exit(failed.length > 0 ? 1 : 0)
