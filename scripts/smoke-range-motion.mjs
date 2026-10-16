// Isolated real lightweight-charts browser test; no financial API requests.
import puppeteer from 'puppeteer-core'
const url = process.env.SMOKE_URL ?? 'http://127.0.0.1:5173'
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
try {
  const page = await browser.newPage()
  await page.setRequestInterception(true)
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/__motion-test') void request.respond({status: 200, contentType: 'text/html', body: '<!doctype html><html><body></body></html>'})
    else void request.continue()
  })
  await page.goto(`${url}/__motion-test`)
  const result = await page.evaluate(async () => {
    const {createChart, LineSeries} = await import('/node_modules/.vite/deps/lightweight-charts.js')
    const {applyRange, cancelRangeMotion} = await import('/src/charts/range.ts')
    const el = document.createElement('div')
    document.body.append(el)
    const chart = createChart(el, {width: 900, height: 300})
    const line = chart.addSeries(LineSeries)
    const data = Array.from({length:1500}, (_, i) => ({time:Date.UTC(2022,0,1)/1000+i*86400, value:100+Math.sin(i/10)*5+i*.05}))
    line.setData(data)
    chart.timeScale().setVisibleLogicalRange({from:400, to:1499})
    const next = () => new Promise(requestAnimationFrame)
    await next(); await next()
    const start = chart.timeScale().getVisibleLogicalRange()
    const lastDate = new Date(data.at(-1).time*1000).toISOString().slice(0,10)
    applyRange(chart,lastDate,'6m')
    const samples=[]
    for(let i=0;i<65;i++){await next();samples.push(chart.timeScale().getVisibleLogicalRange())}
    const end = samples.at(-1)
    const intermediate = samples.filter((r)=>Math.abs(r.from-start.from) > 0.1 && Math.abs(r.from-end.from) > 0.1).length
    cancelRangeMotion(chart)
    chart.remove(); el.remove()
    return {start,first:samples[0],end,unique:new Set(samples.map(r=>r.from.toFixed(3))).size,intermediate,accurate:Math.abs(end.from-1316)<0.1}
  })
  console.log(JSON.stringify(result, null, 2))
  const ok = result.intermediate >= 6 && result.accurate
  console.log(`${ok ? 'PASS' : 'FAIL'}: chart must zoom through intermediate ranges and land on the six-month range`)
  process.exitCode = ok ? 0 : 1
} finally { await browser.close() }
