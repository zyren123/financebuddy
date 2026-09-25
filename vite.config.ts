import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { proxyTwelveData } from './server/tdProxy'

// 开发期 /api/td 由 Vite 中间件直接运行 server/tdProxy.ts 本体
// (与生产的 Vercel / EdgeOne 适配器共用同一核心:白名单、6h 缓存、错误语义完全一致)。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiKey = env.API_KEY ?? process.env.API_KEY ?? ''

  return {
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
              const result = await proxyTwelveData(new URL(req.url, 'http://localhost'), apiKey)
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
