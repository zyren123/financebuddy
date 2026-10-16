import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { proxyTwelveData, upstreamFromEnv } from './server/tdProxy'
import { handleLayoutRequest } from './server/layoutApi'
import { createDevLayoutStore } from './server/devLayoutStore'
import { readBody } from './server/readBody'
import { relayLayoutRequest, vpsRelayFromEnv } from './server/vpsRelay'
import { proxyMarketRequest } from './server/marketProxy'
import { createMemorySnapshotStore, createTdCache } from './server/tdCache'

// 开发期有 API_KEY 时运行当前版本的共享行情缓存,避免依赖尚未部署的 VPS 版本。
// 无本地 key 时仍经 tdProxy 转发;布局的 VPS 转发配置独立保持。
// 开发期 /api/layout 配了 TD_CACHE_* 时转发到 VPS,否则用内存 KV 与出厂 JSON 播种。
// ADMIN_TOKEN 缺省 dev-admin-token(仅本机;生产必须配真实口令)。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiKey = env.API_KEY || process.env.API_KEY || ''
  const localTdCache = apiKey ? createTdCache({ store: createMemorySnapshotStore(), apiKey }) : null
  const tdUpstream = upstreamFromEnv({
    TWELVEDATA_API_KEY: apiKey,
    TD_CACHE_URL: env.TD_CACHE_URL,
    TD_CACHE_TOKEN: env.TD_CACHE_TOKEN,
  })
  const adminToken = env.ADMIN_TOKEN || 'dev-admin-token' // 注意 ||:空串(照抄 .env.example 未填)也要落到缺省
  const relay = vpsRelayFromEnv(env)

  return {
    server: {
      // 设计工具(.impeccable/)会周期性写状态文件;不忽略的话 Vite 每次都整页刷新
      watch: { ignored: ['**/.impeccable/**'] },
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'market-dev-api',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url?.split('?')[0] !== '/api/market') {
              next()
              return
            }
            void (async () => {
              const result = await proxyMarketRequest(new Request(new URL(req.url, 'http://localhost'), { method: req.method ?? 'GET' }), relay)
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
                ? await localTdCache(url.searchParams)
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
          const store = createDevLayoutStore(path.resolve(process.cwd(), 'public/default-dashboard.json'))
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
                : await handleLayoutRequest(layoutRequest, store, adminToken)
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
