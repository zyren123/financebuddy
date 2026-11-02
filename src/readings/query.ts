import { queryOptions, useQuery } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { READINGS_URL } from './model'
import type { ReadingsSnapshot } from './model'
import { parseReadingsSnapshot } from './schema'

/**
 * 默认调用不带任何 init:mode、credentials 与 <link rel=preload as=fetch crossorigin=anonymous> 一致,
 * 浏览器才会复用 preload 的响应。也不传 AbortSignal,组件卸载不会取消这次请求。
 */
async function fetchReadings(init?: RequestInit): Promise<ReadingsSnapshot> {
  const res = await (init ? fetch(READINGS_URL, init) : fetch(READINGS_URL))
  if (!res.ok) throw new Error(`读数请求失败:HTTP ${res.status}`)
  return parseReadingsSnapshot(await res.json())
}

export const readingsQuery = queryOptions({
  queryKey: ['readings'] as const,
  queryFn: () => fetchReadings(),
  staleTime: 5 * 60_000,
})

export function useReadingsSnapshot() {
  return useQuery(readingsQuery)
}

/** "重试缺失数据":绕过浏览器 HTTP 缓存再取一次;失败的来源由服务端每轮刷新自动重试 */
export function refetchReadingsFresh(client: QueryClient): Promise<ReadingsSnapshot> {
  return client.fetchQuery({ ...readingsQuery, queryFn: () => fetchReadings({ cache: 'no-cache' }), staleTime: 0 })
}

/** 服务端快照里该 symbol 的最新 K 线日期;没有快照或没有这个 symbol → null */
export function barDateOf(client: QueryClient, symbol: string): string | null {
  return client.getQueryData(readingsQuery.queryKey)?.bars[symbol] ?? null
}

/** render 前调用:preload 已到时首帧就有数字;没到最多等 waitMs,之后照常渲染加载态 */
export async function bootReadings(client: QueryClient, waitMs = 150): Promise<void> {
  await Promise.race([client.prefetchQuery(readingsQuery), new Promise((resolve) => setTimeout(resolve, waitMs))])
}
