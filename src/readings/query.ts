import { queryOptions, useQuery } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { READINGS_URL } from './model'
import type { ReadingsSnapshot } from './model'
import { parseReadingsSnapshot } from './schema'

/** mode、credentials 须与 <link rel=preload as=fetch crossorigin=anonymous> 一致,浏览器才会复用 preload 的响应 */
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

export function refetchReadingsFresh(client: QueryClient): Promise<ReadingsSnapshot> {
  return client.fetchQuery({ ...readingsQuery, queryFn: () => fetchReadings({ cache: 'no-cache' }), staleTime: 0 })
}

export function barDateOf(client: QueryClient, symbol: string): string | null {
  return client.getQueryData(readingsQuery.queryKey)?.bars[symbol] ?? null
}

export async function bootReadings(client: QueryClient, waitMs = 150): Promise<void> {
  await Promise.race([client.prefetchQuery(readingsQuery), new Promise((resolve) => setTimeout(resolve, waitMs))])
}
