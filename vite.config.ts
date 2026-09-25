import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 开发期:/api/td 由 Vite dev proxy 转发到 Twelve Data 并注入本地 .env 的 key,
// 与线上 api/td.ts(Vercel serverless)行为同构,前端代码两处零差异。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiKey = env.API_KEY ?? process.env.API_KEY ?? ''

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api/td': {
          target: 'https://api.twelvedata.com',
          changeOrigin: true,
          // /api/td/time_series?... → https://api.twelvedata.com/time_series?...
          rewrite: (path) => path.replace(/^\/api\/td/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              const sep = proxyReq.path.includes('?') ? '&' : '?'
              proxyReq.path = `${proxyReq.path}${sep}apikey=${apiKey}`
            })
          },
        },
      },
    },
  }
})
