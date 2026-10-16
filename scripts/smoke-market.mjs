import { readFile } from 'node:fs/promises'
import puppeteer from 'puppeteer-core'

const base = process.env.SMOKE_URL ?? 'http://127.0.0.1:5173'
const out = process.env.SMOKE_OUT ?? '/tmp/financebuddy-market'
const layout = await readFile(new URL('../public/default-dashboard.json', import.meta.url), 'utf8')
const bars = Array.from({ length: 900 }, (_, i) => ({
  datetime: new Date(Date.UTC(2026, 9, 15) - i * 86400000).toISOString().slice(0, 10),
  open: String(300 - i / 10), high: String(302 - i / 10), low: String(299 - i / 10), close: String(301 - i / 10), volume: '1000000',
}))
const marketBars = Array.from({ length: 501 }, (_, i) => ({
  date: new Date(Date.UTC(2026, 9, 15) - (500 - i) * 86400000).toISOString().slice(0, 10), close: 100 + i, high: 102 + i,
}))
const calls = []
let allowFear = false
const errors = []
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const page = await browser.newPage()
const check = (name, ok) => { if (!ok) throw new Error(name); console.log(`✓ ${name}`) }
page.on('pageerror', (error) => errors.push(String(error)))

try {
  await page.setViewport({ width: 1440, height: 1000 })
  await page.setRequestInterception(true)
  page.on('request', (request) => {
    const url = new URL(request.url())
    const json = (body, status = 200) => request.respond({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname === '/api/layout') { request.respond({ status: 200, contentType: 'application/json', body: layout }); return }
    if (url.pathname === '/api/td') { json({ status: 'ok', meta: {}, values: bars }); return }
    if (url.pathname !== '/api/market') { request.continue(); return }
    const feed = url.searchParams.get('feed')
    calls.push(feed)
    if (feed === 'valuations') {
      json({ feed, indices: [
        { index: 'sp500', date: '2026-10-15', pe: 25.1, percentile: 0 },
        { index: 'nasdaq100', date: '2026-10-15', pe: 30.04, percentile: 45.08 },
      ] }); return
    }
    if (feed === 'fear-greed') {
      if (!allowFear) { json({ error: 'unavailable' }, 502); return }
      json({ feed, score: 42, date: '2026-10-15' }); return
    }
    json({ feed, bars: marketBars })
  })
  await page.goto(base, { waitUntil: 'networkidle2' })
  await page.waitForSelector('.react-grid-item canvas')
  await page.evaluate(() => {
    document.getElementById('charts').scrollIntoView({ behavior: 'instant' })
    const button = [...document.querySelectorAll('.react-grid-item button')].find((item) => item.textContent.trim() === '1年')
    button.click()
    window.marketSmokeCanvas = document.querySelector('.react-grid-item canvas')
  })
  check('默认显示图表，尚未请求市场数据', calls.length === 0 && await page.$eval('#dashboard-tab-charts', (el) => el.getAttribute('aria-selected') === 'true'))
  await page.focus('#dashboard-tab-charts')
  await page.keyboard.press('ArrowRight')
  await page.waitForFunction(() => document.querySelector('#dashboard-panel-market').innerText.includes('来源暂不可用'))
  check('键盘切换页签并按需请求五个来源', new Set(calls).size === 5 && await page.$eval('#dashboard-tab-market', (el) => el.getAttribute('aria-selected') === 'true'))
  check('指标表保留四行,已移除前瞻 PE 及占位说明', await page.$eval('#dashboard-panel-market', (panel) => panel.querySelectorAll('tbody tr').length === 4 && !/前瞻|forward|免费源暂未提供/i.test(panel.textContent)))
  check('0 百分位仍显示为有效读数', await page.$$eval('#dashboard-panel-market tr', (rows) => rows.find((row) => row.textContent.includes('PE 百分位')).textContent.includes('0.0%')))
  const beforeRetry = calls.length
  allowFear = true
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent === '重试缺失数据').click())
  await page.waitForFunction(() => document.querySelector('#dashboard-panel-market').innerText.includes('42.0'))
  check('重试只请求失败来源，其他读数保持', calls.length === beforeRetry + 1 && calls.at(-1) === 'fear-greed')
  const loadedCalls = calls.length
  await page.screenshot({ path: `${out}-desktop.png` })
  await page.click('#dashboard-tab-charts')
  check('返回图表保留所选区间和图表实例', await page.evaluate(() => {
    const oneYear = [...document.querySelectorAll('.react-grid-item button')].find((button) => button.textContent.trim() === '1年')
    return oneYear.getAttribute('aria-pressed') === 'true' && window.marketSmokeCanvas === document.querySelector('.react-grid-item canvas')
  }))
  await page.click('#dashboard-tab-market')
  check('重新进入指标不重复请求新鲜数据', calls.length === loadedCalls)
  await page.setViewport({ width: 390, height: 844 })
  await page.evaluate(() => document.getElementById('charts').scrollIntoView({ behavior: 'instant' }))
  await page.screenshot({ path: `${out}-mobile.png` })
  check('手机无横向溢出，两指数仍为三列表', await page.evaluate(() => document.documentElement.scrollWidth === innerWidth && document.querySelectorAll('#dashboard-panel-market thead th').length === 3))
  await page.click('#dashboard-panel-market summary')
  await page.evaluate(() => document.querySelector('#dashboard-panel-market details').scrollIntoView({ behavior: 'instant', block: 'end' }))
  await page.screenshot({ path: `${out}-mobile-details.png` })
  check('口径和来源可展开查看', await page.$eval('#dashboard-panel-market details', (el) => el.open && el.querySelectorAll('a').length === 4))
  check('没有页面脚本错误', errors.length === 0)
} catch (error) {
  console.error(JSON.stringify({ calls, state: await page.evaluate(() => ({ selected: document.querySelector('[role=tab][aria-selected=true]')?.textContent, market: document.querySelector('#dashboard-panel-market')?.innerText.slice(-800) })) }))
  throw error
} finally {
  await browser.close()
}
