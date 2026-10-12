// 部署后自检:容器、Redis、本机端口、公网 HTTPS 反代与口令。失败时退出码非 0。
// 口令从 VPS 的 vps/.env 读进内存,只用于请求头,不打印。
// 只请求 CGDV 一个标的:快照 6h 内命中缓存,不消耗 Twelve Data credit;过期时最多刷新 1 次。
import { execFileSync } from 'node:child_process'

const HOST = process.env.VPS_HOST ?? 'ubuntu@140.245.103.19'
const API = process.env.VPS_API_URL ?? 'https://api.zenode.duckdns.org'
const TD_QUERY = '/api/td?endpoint=time_series&symbol=CGDV&interval=1day&outputsize=5000'

const results = []
const check = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` (${detail})` : ''}`)
}
const ssh = (cmd) => execFileSync('ssh', [HOST, cmd], { encoding: 'utf8' }).trim()

const ps = ssh('cd ~/financebuddy/vps && sudo docker compose ps --format "{{.Service}}={{.State}}"')
for (const service of ['redis', 'td-cache', 'web']) {
  check(`容器 ${service} 在运行`, ps.includes(`${service}=running`), ps.replace(/\n/g, ' '))
}
check('Redis 响应 PING', ssh('cd ~/financebuddy/vps && sudo docker compose exec -T redis redis-cli ping') === 'PONG')
check('td-cache 本机 healthz', ssh('curl -s 127.0.0.1:8787/healthz') === '{"ok":true}')
check('备用前端本机首页', ssh('curl -s -o /dev/null -w %{http_code} 127.0.0.1:8788/') === '200')
check(
  '备用前端经 nginx 读布局',
  ['200', '404'].includes(ssh('curl -s -o /dev/null -w %{http_code} 127.0.0.1:8788/api/layout')),
)

const token = ssh('grep ^TD_CACHE_TOKEN= ~/financebuddy/vps/.env | cut -d= -f2-')
const get = (path, headers = {}) => fetch(`${API}${path}`, { headers, signal: AbortSignal.timeout(20_000) })

const health = await get('/healthz')
check(
  '公网 HTTPS healthz',
  health.status === 200,
  health.status === 502 ? '502:检查 1Panel 反代的后端协议是不是 http' : `HTTP ${health.status}`,
)
check('公网不带口令被拒', (await get(TD_QUERY)).status === 401)
check('公网错误口令被拒', (await get(TD_QUERY, { 'x-td-cache-token': 'wrong' })).status === 401)
const td = await get(TD_QUERY, { 'x-td-cache-token': token })
const tdBody = td.status === 200 ? await td.json() : null
check('公网带口令取行情', td.status === 200 && tdBody?.values?.length > 0, `HTTP ${td.status}, bars ${tdBody?.values?.length ?? 0}`)
const layout = await get('/api/layout', { 'x-td-cache-token': token })
check('公网带口令读布局', [200, 404].includes(layout.status), `HTTP ${layout.status}`)

const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} 项通过`)
process.exit(failed > 0 ? 1 : 0)
