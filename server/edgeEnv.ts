/**
 * EdgeOne 环境变量按名逐个读:env 优先,回退 process.env(本地调试)。
 * 不用对象展开,因为边缘运行时的 process.env 可能是不可枚举的代理,展开会丢掉全部键。
 */
export function readEdgeEnv<K extends string>(
  env: Record<string, unknown> | undefined,
  keys: readonly K[],
): Record<K, string | undefined> {
  const processEnv = typeof process !== 'undefined' ? process.env : undefined
  const out = {} as Record<K, string | undefined>
  for (const key of keys) {
    const fromEnv = env?.[key]
    out[key] = typeof fromEnv === 'string' ? fromEnv : processEnv?.[key]
  }
  return out
}
