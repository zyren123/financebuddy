import { createHash, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { createClient } from 'redis'
import { createMemorySnapshotStore, createTdCache, type Snapshot, type SnapshotStore } from '../../server/tdCache.ts'

const { TWELVEDATA_API_KEY, TD_CACHE_TOKEN, REDIS_URL } = process.env
const PORT = Number(process.env.PORT ?? 8787)
if (!TWELVEDATA_API_KEY || !TD_CACHE_TOKEN) {
  console.error('TWELVEDATA_API_KEY and TD_CACHE_TOKEN are required')
  process.exit(1)
}

async function redisStore(url: string): Promise<SnapshotStore> {
  const client = createClient({ url })
  client.on('error', (err) => console.error('redis', err))
  await client.connect()
  return {
    async get(key) {
      const raw = await client.get(key)
      return raw ? (JSON.parse(raw) as Snapshot) : null
    },
    async set(key, snapshot) {
      await client.set(key, JSON.stringify(snapshot))
    },
  }
}

const digest = (s: string) => createHash('sha256').update(s).digest()
const expected = digest(TD_CACHE_TOKEN)
const authorized = (header: string | string[] | undefined) =>
  typeof header === 'string' && timingSafeEqual(digest(header), expected)

const store = REDIS_URL ? await redisStore(REDIS_URL) : createMemorySnapshotStore()
const handle = createTdCache({ store, apiKey: TWELVEDATA_API_KEY })

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://td-cache')
  const send = (status: number, body: string) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(body)
  }
  if (url.pathname === '/healthz') return send(200, '{"ok":true}')
  if (url.pathname !== '/api/td') return send(404, '{"error":"not found"}')
  if (req.method !== 'GET') return send(405, '{"error":"method not allowed"}')
  if (!authorized(req.headers['x-td-cache-token'])) return send(401, '{"error":"unauthorized"}')

  const started = Date.now()
  handle(url.searchParams)
    .then((r) => {
      console.log(
        JSON.stringify({
          symbol: url.searchParams.get('symbol'),
          interval: url.searchParams.get('interval'),
          start: url.searchParams.get('start_date'),
          outcome: r.outcome,
          status: r.status,
          ms: Date.now() - started,
        }),
      )
      send(r.status, r.body)
    })
    .catch((err) => {
      console.error('handler', err)
      send(500, '{"error":"internal error"}')
    })
}).listen(PORT, () => console.log(`td-cache listening on :${PORT} (store: ${REDIS_URL ? 'redis' : 'memory'})`))
