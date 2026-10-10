import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { proxyTwelveData, upstreamFromEnv } from './server/tdProxy'
import { handleLayoutRequest } from './server/layoutApi'
import { createDevLayoutStore } from './server/devLayoutStore'
import { readBody } from './server/readBody'

// 开发期 /api/td 由 Vite 中间件直接运行 server/tdProxy.ts 本体
// (与生产的 Vercel / EdgeOne 适配器共用同一核心:白名单、6h 缓存、错误语义完全一致)。
// 开发期 /api/layout 同理由中间件直接运行 server/layoutApi.ts(内存 KV,出厂 JSON 播种),
// ADMIN_TOKEN 缺省 dev-admin-token(仅本机;生产必须配真实口令)。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // dev 沿用 .env 的 API_KEY;另配 TD_CACHE_URL + TD_CACHE_TOKEN 可改走 VPS 共享缓存
  const tdUpstream = upstreamFromEnv({
    TWELVEDATA_API_KEY: env.API_KEY || process.env.API_KEY || '',
    TD_CACHE_URL: env.TD_CACHE_URL,
    TD_CACHE_TOKEN: env.TD_CACHE_TOKEN,
  })
  const adminToken = env.ADMIN_TOKEN || 'dev-admin-token' // 注意 ||:空串(照抄 .env.example 未填)也要落到缺省

  return {
    server: {
      // 设计工具(.impeccable/)会周期性写状态文件;不忽略的话 Vite 每次都整页刷新
      watch: { ignored: ['**/.impeccable/**'] },
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'td-dev-proxy',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (!req.url?.startsWith('/api/td')) {
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
              const result = await proxyTwelveData(new URL(req.url, 'http://localhost'), tdUpstream)
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
              const result = await handleLayoutRequest(
                {
                  method: req.method ?? 'GET',
                  url: new URL(req.url, 'http://localhost'),
                  body: await readBody(req),
                  adminToken: Array.isArray(headerToken) ? (headerToken[0] ?? null) : (headerToken ?? null),
                },
                store,
                adminToken,
              )
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
