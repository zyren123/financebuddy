import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Vercel 逐文件编译 api/*.ts 后用 Node ESM 加载(package.json 是 "type": "module"),
// 相对 import 不写扩展名会在运行时 ERR_MODULE_NOT_FOUND。类型 import 编译后被擦除,不受影响。
const ROOT = path.resolve(__dirname, '..')
const ENTRIES = ['api/td.ts', 'api/layout.ts']
const RUNTIME_RELATIVE_IMPORT = /^import\s+(?!type\b)[^'"]*from\s+'(\.{1,2}\/[^']+)'/gm

function missingExtensions(): string[] {
  const seen = new Set<string>()
  const problems: string[] = []
  const visit = (file: string) => {
    if (seen.has(file)) return
    seen.add(file)
    const source = readFileSync(path.join(ROOT, file), 'utf8')
    for (const [, spec] of source.matchAll(RUNTIME_RELATIVE_IMPORT)) {
      if (!spec!.endsWith('.js')) {
        problems.push(`${file}: '${spec}'`)
        continue
      }
      visit(path.join(path.dirname(file), spec!.replace(/\.js$/, '.ts')))
    }
  }
  ENTRIES.forEach(visit)
  return problems
}

describe('Vercel 函数的运行时 import', () => {
  it('从 api/ 入口可达的相对 import 都带 .js 扩展名', () => {
    expect(missingExtensions()).toEqual([])
  })
})
