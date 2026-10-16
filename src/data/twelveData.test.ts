import { afterEach, expect, it, vi } from 'vitest'
import { fetchBars } from './twelveData'

vi.mock('./rateLimit', () => ({ acquireCredit: vi.fn().mockResolvedValue(undefined) }))

afterEach(() => vi.unstubAllGlobals())

it('日线明确请求分红与拆股复权,并把上游前复权 OHLC 传给图表和指标', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ status: 'ok', values: [
    { datetime: '2026-10-15', open: '100', high: '102', low: '99', close: '101', volume: '2000' },
    { datetime: '2026-10-14', open: '97', high: '100', low: '96', close: '99', volume: '1500' },
  ] }))
  vi.stubGlobal('fetch', fetcher)
  const bars = await fetchBars({ symbol: 'QQQ', interval: '1day' })
  const url = new URL(String(fetcher.mock.calls[0][0]), 'https://local')
  expect(url.searchParams.get('adjust')).toBe('all')
  expect(url.searchParams.get('outputsize')).toBe('5000')
  expect(bars).toEqual([
    { datetime: '2026-10-14', open: 97, high: 100, low: 96, close: 99, volume: 1500 },
    { datetime: '2026-10-15', open: 100, high: 102, low: 99, close: 101, volume: 2000 },
  ])
})
