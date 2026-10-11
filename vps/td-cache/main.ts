import { createHash, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage } from 'node:http'
import { createClient } from 'redis'
import { handleLayoutRequest, type LayoutStore } from '../../server/layoutApi'
import { createMemorySnapshotStore, createTdCache, type Snapshot, type SnapshotStore } from '../../server/tdCache'
import { VPS_TOKEN_HEADER } from '../../server/vpsRelay'

const { TWELVEDATA_API_KEY, TD_CACHE_TOKEN, ADMIN_TOKEN, REDIS_URL } = process.env
const PORT = Number(process.env.PORT ?? 8787)
const MAX_BODY_BYTES = 256 * 1024
if (!TWELVEDATA_API_KEY || !TD_CACHE_TOKEN) {
  console.error('TWELVEDATA_API_KEY and TD_CACHE_TOKEN are required')
  process.exit(1)
}

interface Stores {
  snapshots: SnapshotStore
  layouts: LayoutStore
}

async function redisStores(url: string): Promise<Stores> {
  const client = createClient({ url })
  client.on('error', (err) => console.error('redis', err))
  await client.connect()
  return {
    snapshots: {
      async get(key) {
        const raw = await client.get(key)
        return raw ? (JSON.parse(raw) as Snapshot) : null
      },
      async set(key, snapshot) {
        await client.set(key, JSON.stringify(snapshot))
      },
    },
    layouts: {
      get: (key) => client.get(key),
      async put(key, value) {
        await client.set(key, value)
      },
    },
  }
}

function memoryStores(): Stores {
  const map = new Map<string, string>()
  return {
    snapshots: createMemorySnapshotStore(),
    layouts: { get: async (key) => map.get(key) ?? null, put: async (key, value) => void map.set(key, value) },
  }
}

const digest = (s: string) => createHash('sha256').update(s).digest()
const expected = digest(TD_CACHE_TOKEN)
const authorized = (header: string | string[] | undefined) =>
  typeof header === 'string' && timingSafeEqual(digest(header), expected)

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    // 超限后继续读完但丢弃,直接断开的话客户端收不到 413
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size <= MAX_BODY_BYTES) chunks.push(chunk)
    })
    req.on('end', () => {
      if (size > MAX_BODY_BYTES) reject(new Error('body too large'))
      else resolve(chunks.length === 0 ? null : Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', reject)
  })
}

const stores = REDIS_URL ? await redisStores(REDIS_URL) : memoryStores()
const handleTd = createTdCache({ store: stores.snapshots, apiKey: TWELVEDATA_API_KEY })

async function route(req: IncomingMessage, url: URL): Promise<{ status: number; body: string; log?: object }> {
  if (url.pathname === '/healthz') return { status: 200, body: '{"ok":true}' }
  const isTd = url.pathname === '/api/td'
  const isLayout = url.pathname === '/api/layout'
  if (!isTd && !isLayout) return { status: 404, body: '{"error":"not found"}' }
  if (!authorized(req.headers[VPS_TOKEN_HEADER])) return { status: 401, body: '{"error":"unauthorized"}' }

  if (isTd) {
    if (req.method !== 'GET') return { status: 405, body: '{"error":"method not allowed"}' }
    const r = await handleTd(url.searchParams)
    const p = url.searchParams
    return { ...r, log: { symbol: p.get('symbol'), interval: p.get('interval'), start: p.get('start_date'), outcome: r.outcome } }
  }

  const adminHeader = req.headers['x-admin-token']
  const method = req.method ?? 'GET'
  let body: string | null
  try {
    body = method === 'GET' || method === 'HEAD' ? null : await readBody(req)
  } catch {
    return { status: 413, body: '{"error":"body too large"}' }
  }
  const r = await handleLayoutRequest(
    { method, url, body, adminToken: typeof adminHeader === 'string' ? adminHeader : null },
    stores.layouts,
    ADMIN_TOKEN || undefined,
  )
  return { ...r, log: { layout: method } }
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://td-cache')
  const started = Date.now()
  route(req, url)
    .then((r) => {
      if (r.log) console.log(JSON.stringify({ ...r.log, status: r.status, ms: Date.now() - started }))
      res.writeHead(r.status, { 'content-type': 'application/json' })
      res.end(r.body)
    })
    .catch((err) => {
      console.error('handler', err)
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end('{"error":"internal error"}')
    })
}).listen(PORT, () => console.log(`td-cache listening on :${PORT} (store: ${REDIS_URL ? 'redis' : 'memory'})`))
