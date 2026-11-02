import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { proxyTwelveData, upstreamFromEnv } from './server/tdProxy'
import { PUBLISHED_KEY, handleLayoutRequest } from './server/layoutApi'
import { createDevLayoutStore } from './server/devLayoutStore'
import { readBody } from './server/readBody'
import { relayLayoutRequest, relayToVps, vpsRelayFromEnv, type VpsRelay } from './server/vpsRelay'
import { createMemorySnapshotStore, createTdCache } from './server/tdCache'
import { createCreditLimiter } from './server/credits'
import { createMarketSource, createMemoryTextStore } from './server/marketData'
import { createReadingsService } from './server/readings'
import { handleReadingsRequest, proxyReadingsRequest } from './server/readingsApi'
import { barsFromTimeSeries, type RawTimeSeriesBar } from './src/data/timeSeries'
import { PRICE_ADJUSTMENT, type Bar } from './src/data/types'

function relayBars(relay: VpsRelay) {
  return async (symbol: string): Promise<Bar[] | null> => {
    const params = new URLSearchParams({ endpoint: 'time_series', symbol, interval: '1day', outputsize: '5000', adjust: PRICE_ADJUSTMENT })
    const r = await relayToVps(relay, `/api/td?${params.toString()}`)
    if (r.status !== 200) return null
    const json = JSON.parse(r.body) as { status?: string; values?: RawTimeSeriesBar[] }
    return json.status === 'ok' && Array.isArray(json.values) ? barsFromTimeSeries(json.values) : null
  }
}

// 开发期有 API_KEY 时运行当前版本的共享行情缓存,避免依赖尚未部署的 VPS 版本。
// 无本地 key 时仍经 tdProxy 转发;布局的 VPS 转发配置独立保持。
// 开发期 /api/layout 配了 TD_CACHE_* 时转发到 VPS,否则用内存 KV 与出厂 JSON 播种。
// ADMIN_TOKEN 缺省 dev-admin-token(仅本机;生产必须配真实口令)。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiKey = env.API_KEY || process.env.API_KEY || ''
  const localTdCache = apiKey ? createTdCache({ store: createMemorySnapshotStore(), apiKey, credits: createCreditLimiter() }) : null
  const tdUpstream = upstreamFromEnv({
    TWELVEDATA_API_KEY: apiKey,
    TD_CACHE_URL: env.TD_CACHE_URL,
    TD_CACHE_TOKEN: env.TD_CACHE_TOKEN,
  })
  const adminToken = env.ADMIN_TOKEN || 'dev-admin-token' // 注意 ||:空串(照抄 .env.example 未填)也要落到缺省
  const relay = vpsRelayFromEnv(env)
  const layoutStore = createDevLayoutStore(path.resolve(process.cwd(), 'public/default-dashboard.json'))
  const readings = createReadingsService({
    bars: localTdCache ? localTdCache.bars : relay ? relayBars(relay) : async () => null,
    market: createMarketSource({ store: createMemoryTextStore() }).load,
    publishedLayout: relay
      ? async () => {
          const r = await relayLayoutRequest(relay, { method: 'GET', url: new URL('http://localhost/api/layout'), body: null, adminToken: null })
          return r.status === 200 ? r.body : null
        }
      : () => layoutStore.get(PUBLISHED_KEY),
  })

  return {
    server: {
      // 设计工具(.impeccable/)会周期性写状态文件;不忽略的话 Vite 每次都整页刷新
      watch: { ignored: ['**/.impeccable/**'] },
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'readings-dev-api',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url?.split('?')[0] !== '/api/readings') {
              next()
              return
            }
            void (async () => {
              const request = new Request(new URL(req.url, 'http://localhost'), { method: req.method ?? 'GET' })
              const relayed = relay ? await proxyReadingsRequest(request, relay, {}) : null
              const result = relayed && relayed.status !== 404 ? relayed : await handleReadingsRequest(request, readings)
              res.statusCode = result.status
              result.headers.forEach((value, key) => res.setHeader(key, value))
              res.end(await result.text())
            })()
          })
        },
      },
      {
        name: 'td-dev-proxy',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url?.split('?')[0] !== '/api/td') {
              next()
              return
            }
            void (async () => {
              if (req.method !== 'GET') {
                res.statusCode = 405
                res.setHeader('content-type', 'application/json')
                res.end(JSON.stringify({ error: 'method not allowed' }))
                return
              }
              const url = new URL(req.url, 'http://localhost')
              const result = localTdCache
                ? await localTdCache.handle(url.searchParams)
                : await proxyTwelveData(url, tdUpstream)
              res.statusCode = result.status
              res.setHeader('content-type', 'application/json')
              res.end(result.body)
            })()
          })
        },
      },
      {
        name: 'layout-dev-api',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url?.split('?')[0] !== '/api/layout') {
              next()
              return
            }
            void (async () => {
              const headerToken = req.headers['x-admin-token']
              const layoutRequest = {
                method: req.method ?? 'GET',
                url: new URL(req.url, 'http://localhost'),
                body: await readBody(req),
                adminToken: Array.isArray(headerToken) ? (headerToken[0] ?? null) : (headerToken ?? null),
              }
              const result = relay
                ? await relayLayoutRequest(relay, layoutRequest)
                : await handleLayoutRequest(layoutRequest, layoutStore, adminToken)
              if (result.status === 200 && layoutRequest.method !== 'GET') void readings.refresh().catch(() => {})
              res.statusCode = result.status
              res.setHeader('content-type', 'application/json')
              res.end(result.body)
            })()
          })
        },
      },
    ],
  }
})
