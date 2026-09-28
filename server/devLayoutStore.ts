import { readFile } from 'node:fs/promises'
import { PUBLISHED_KEY, type LayoutStore } from './layoutApi'

/**
 * 开发期 LayoutStore adapter:进程内存 + 首次读取时从 public/default-dashboard.json
 * 播种(模拟「KV 未发布 → Factory 兜底」的初始态)。dev server 重启即回出厂,
 * 需要留存的成果用 Admin 导出(ADR-0003 的备份闭环)。
 */
export function createDevLayoutStore(seedFile: string): LayoutStore {
  const map = new Map<string, string>()
  let seeded = false
  const seed = async () => {
    if (seeded) return
    seeded = true
    try {
      map.set(PUBLISHED_KEY, await readFile(seedFile, 'utf8'))
    } catch {
      // 种子读不到就当作未发布(GET 404,客户端回落捆绑 JSON)
    }
  }
  return {
    async get(key) {
      await seed()
      return map.get(key) ?? null
    },
    async put(key, value) {
      await seed()
      map.set(key, value)
    },
  }
}
