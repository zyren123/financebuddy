import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import html from '../../index.html?raw'
import { FALLBACK_BASIS } from './basis'
import { buildSnapshot } from './compute'
import { READINGS_URL } from './model'
import { barDateOf, bootReadings, readingsQuery } from './query'
import { syntheticBars } from './testBars'

const snapshot = buildSnapshot(new Map([['QQQ', syntheticBars(2)], ['VTV', syntheticBars(1)]]), {
  sp500: null, nasdaq100: null, vix: null, valuations: null, 'fear-greed': null,
}, FALLBACK_BASIS, 1)

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('readings query', () => {
  it('index.html 的 preload href 就是 READINGS_URL,as=fetch + crossorigin=anonymous', () => {
    const link = html.match(/<link rel="preload" href="([^"]+)" as="fetch" crossorigin="anonymous" \/>/)
    expect(link?.[1]).toBe(READINGS_URL)
  })

  it('首次 fetch 只传 URL,不带 init,与 preload 的请求模式一致', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(snapshot))
    vi.stubGlobal('fetch', fetcher)
    const client = new QueryClient()
    await client.fetchQuery(readingsQuery)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0]).toEqual([READINGS_URL])
    expect(barDateOf(client, 'QQQ')).toBe('2026-10-09')
    expect(barDateOf(client, 'SCHD')).toBeNull()
  })

  it('bootReadings 最多等 150ms,数据先到就先返回', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(() => new Promise(() => {})))
    let settled = false
    void bootReadings(new QueryClient()).then(() => { settled = true })
    await vi.advanceTimersByTimeAsync(149)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(settled).toBe(true)

    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json(snapshot)))
    const client = new QueryClient()
    await bootReadings(client)
    expect(client.getQueryData(readingsQuery.queryKey)?.computedAt).toBe(1)
  })

  it('快照请求失败时 bootReadings 不抛,照常渲染', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 503 })))
    await expect(bootReadings(new QueryClient())).resolves.toBeUndefined()
  })
})
