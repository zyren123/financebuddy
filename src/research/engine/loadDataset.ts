/** 静态 JSON 的读取边界:在这里校验形状,引擎内部只信任类型 */
import type { Archive, Dataset } from '../types'

const SERIES = ['ndx', 'tqqq', 'qqq', 'spy', 'cash'] as const

function fail(what: string): never {
  throw new Error(`研究数据集无效:${what}`)
}

export function parseDataset(raw: unknown): Dataset {
  if (typeof raw !== 'object' || raw === null) fail('不是 JSON 对象')
  const data = raw as Record<string, unknown>
  const dates = data.dates
  if (!Array.isArray(dates) || dates.length < 2) fail('缺少 dates')
  for (let i = 0; i < dates.length; i++) {
    const d = dates[i]
    if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) fail(`dates[${i}] 不是 ISO 日期`)
    if (i > 0 && d <= dates[i - 1]) fail(`dates[${i}] 未严格递增`)
  }
  const series = {} as Record<(typeof SERIES)[number], Float64Array>
  for (const key of SERIES) {
    const values = data[key]
    if (!Array.isArray(values)) fail(`缺少 ${key}`)
    if (values.length !== dates.length) fail(`${key} 长度 ${values.length} 与 dates 长度 ${dates.length} 不一致`)
    const out = new Float64Array(values.length)
    for (let i = 0; i < values.length; i++) {
      const v = values[i]
      // 收益 ≤ -1 会让重建的收盘价归零或变负
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= -1) fail(`${key}[${i}] 不是大于 -1 的有限数(${String(v)})`)
      out[i] = v
    }
    series[key] = out
  }
  const row = (key: string) => {
    const v = data[key]
    if (!Number.isInteger(v) || (v as number) < 1 || (v as number) >= dates.length - 2) fail(`${key} 不是有效行号`)
    return v as number
  }
  return { dates: dates as string[], ...series, evalStart: row('evalStart'), realTqqqFrom: row('realTqqqFrom') }
}

export function parseArchive(raw: unknown): Archive {
  if (typeof raw !== 'object' || raw === null) throw new Error('研究归档无效:不是 JSON 对象')
  const data = raw as Record<string, unknown>
  for (const key of ['generated', 'screen', 'params', 'matched', 'worlds'] as const) {
    if (typeof data[key] !== 'object' || data[key] === null) throw new Error(`研究归档无效:缺少 ${key}`)
  }
  const worlds = data.worlds as Record<string, unknown>
  if (!Array.isArray(worlds.runs) || !Array.isArray(worlds.rules)) throw new Error('研究归档无效:worlds 缺少 runs 或 rules')
  return raw as Archive
}

async function fetchJson(url: string, label: string): Promise<unknown> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${label}读取失败:HTTP ${response.status}(${url})`)
  return response.json()
}

export async function loadDataset(url = '/research/dataset.json'): Promise<Dataset> {
  return parseDataset(await fetchJson(url, '研究数据集'))
}

export async function loadArchive(url = '/research/archive.json'): Promise<Archive> {
  return parseArchive(await fetchJson(url, '研究归档'))
}
