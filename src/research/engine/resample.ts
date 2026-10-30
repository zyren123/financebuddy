/**
 * 平行世界的行重排,算法同 bootstrap.py 的 permuted_blocks / stationary_bootstrap。
 * 随机流用 sfc32,与 numpy 的 PCG64 不同:同一 seed 不会抽出 Python 归档里的同一批世界,只保证分布口径一致。
 * 每个世界的流只由 (seed, world) 决定,与 worker 数量和分批方式无关。
 */

export type Random = () => number

/** [0, 1) 均匀分布,32 位精度 */
export function worldRandom(seed: number, world: number): Random {
  let a = mix(seed >>> 0) ^ 0x9e3779b9
  let b = mix(Math.floor(seed / 2 ** 32) >>> 0) ^ 0x243f6a88
  let c = mix(world >>> 0) ^ 0xb7e15162
  let d = 1
  const next = () => {
    const t = (((a + b) | 0) + d) | 0
    d = (d + 1) | 0
    a = b ^ (b >>> 9)
    b = (c + (c << 3)) | 0
    c = (c << 21) | (c >>> 11)
    c = (c + t) | 0
    return (t >>> 0) / 2 ** 32
  }
  for (let i = 0; i < 15; i++) next()
  return next
}

function mix(x: number): number {
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d)
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b)
  return (x ^ (x >>> 16)) >>> 0
}

const below = (random: Random, n: number) => Math.floor(random() * n)

/** 历史切成连续等长块后打乱块序,每天恰好出现一次 */
export function permutedBlocks(n: number, block: number, random: Random): Int32Array {
  const blocks = Math.ceil(n / block)
  const order = new Int32Array(blocks)
  for (let i = 0; i < blocks; i++) order[i] = i
  for (let i = blocks - 1; i > 0; i--) {
    const j = below(random, i + 1)
    const tmp = order[i]
    order[i] = order[j]
    order[j] = tmp
  }
  const idx = new Int32Array(n)
  let k = 0
  for (const b of order) for (let r = b * block; r < Math.min(b * block + block, n); r++) idx[k++] = r
  return idx
}

/** Politis & Romano (1994):随机起点、几何块长、环形接续;有的日子重复,有的缺席 */
export function stationaryBootstrap(n: number, meanBlock: number, random: Random): Int32Array {
  const idx = new Int32Array(n)
  idx[0] = below(random, n)
  for (let t = 1; t < n; t++) {
    idx[t] = random() < 1 / meanBlock ? below(random, n) : (idx[t - 1] + 1) % n
  }
  return idx
}
