// Run the author's actual public JavaScript on every available prefix.
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.join(root, 'data/index.html'), 'utf8')
const data = JSON.parse(fs.readFileSync(path.join(root, 'data/author_data.json'), 'utf8'))
const start = source.indexOf('  function sd(')
const end = source.indexOf('  function render(', start)
if (start < 0 || end < 0) throw new Error('Author source layout changed; inspect before running')
const context = vm.createContext({ Math })
const parametersStart = source.indexOf('  var P =')
const parametersEnd = source.indexOf('  var CACHE', parametersStart)
if (parametersStart < 0 || parametersEnd < 0) throw new Error('Author parameters missing')
vm.runInContext(source.slice(parametersStart, parametersEnd) + source.slice(start, end), context)
const rows = []
for (let n = 252; n <= data.closes.length; n++) {
  const result = context.compute(data.dates.slice(0, n), data.closes.slice(0, n))
  if (result.err) throw new Error(result.err)
  rows.push({ date: data.dates[n - 1], ...result })
}
fs.writeFileSync(path.join(root, 'results/author_js_reference.json'), JSON.stringify(rows, null, 2))
console.log(`Author JS: ${rows.length} prefixes saved; final result:`, rows.at(-1))
