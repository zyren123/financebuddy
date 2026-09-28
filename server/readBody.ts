import type { IncomingMessage } from 'node:http'

/** 收集 Node 风格请求体(vite 中间件与 Vercel adapter 共用);无 body 返回 null */
export function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(chunks.length === 0 ? null : Buffer.concat(chunks).toString('utf8')))
    req.on('error', () => resolve(null))
  })
}
