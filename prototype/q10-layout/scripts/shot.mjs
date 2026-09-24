// 原型自检截图(验证用,非原型本体):三个变体各截一张 + A 布局拖拽后 + C 布局切标签
// 用法:OUT=/tmp/shots node scripts/shot.mjs [chromium 可执行文件路径]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

// 注:本机 playwright 缓存里的 Chrome for Testing 缺 Framework(不可用),默认用系统 Chrome
const exe =
  process.argv[2] ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = process.env.OUT ?? 'shots'
const BASE = process.env.BASE ?? 'http://localhost:5174'

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({
  executablePath: exe,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } })

const shoot = async (name, path, extra) => {
  await page.goto(`${BASE}${path}`)
  await page.waitForTimeout(1500)
  if (extra) await extra()
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log(`✓ ${name}`)
}

await shoot('variant-a-quad', '/?layout=a&preset=quad')
await shoot('variant-b', '/?layout=b')
await shoot('variant-c', '/?layout=c')

// A · 自上而下预设:确认 B 式单列观感 + 拖拽换位依然可用(把 Ratio ROC 拖到 QQQ 上面)
await shoot('variant-a-flow', '/?layout=a&preset=flow')
await shoot('variant-a-flow-dragged', '/?layout=a&preset=flow', async () => {
  const h = await page.locator('.card-drag-handle').nth(1).boundingBox()
  await page.mouse.move(h.x + 90, h.y + 14)
  await page.mouse.down()
  await page.mouse.move(h.x + 90, h.y + 14 - 440, { steps: 14 })
  await page.mouse.up()
  await page.waitForTimeout(600)
})

// C:点开右侧标签组里的第二个标签,验证标签页切换
await shoot('variant-c-tab', '/?layout=c', async () => {
  try {
    await page.locator('.dv-default-tab:has-text("SCHD")').click({ timeout: 4000 })
  } catch {
    console.log('(未找到 .dv-default-tab,跳过标签点击)')
  }
})

await browser.close()
console.log(`done → ${OUT}/`)
