// Twelve Data 免费档:8 credits/分钟。所有会烧 credit 的上游请求先在这里排队。
// 滑动窗口实现:窗口内不足 8 个时间戳立即放行,否则睡到最早一个过期为止。

const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 8

let stamps: number[] = []

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function acquireCredit(): Promise<void> {
  for (;;) {
    const now = Date.now()
    stamps = stamps.filter((t) => now - t < WINDOW_MS)
    if (stamps.length < MAX_PER_WINDOW) {
      stamps.push(now)
      return
    }
    await sleep(stamps[0]! + WINDOW_MS - now + 5)
  }
}
