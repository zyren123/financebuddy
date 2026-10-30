import type { PairedWins } from '../types'
import { share } from './format'
import type { StripMetric } from './StripChart'
import { Term } from './Term'

const VERB: Record<StripMetric, string> = { maxDrawdown: '回撤更浅', cagr: '年化更高', sharpe: 'Sharpe 更高' }

/** 行规则胜过列规则的世界占比;条从 50% 中线向左右伸出,不靠颜色表达方向 */
export function PairedMatrix({ rules, paired, metric }: {
  rules: { id: string; label: string; color: string }[]
  paired: PairedWins
  metric: StripMetric
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-[12px]">
        <caption className="mb-3 text-left text-[12px] text-ink-muted">
          <Term k="paired">配对胜率</Term>：同一个平行世界里，行规则比列规则{VERB[metric]}的世界占比
        </caption>
        <thead>
          <tr className="border-b border-edge">
            <th scope="col" className="w-[26%] pb-3 text-left font-normal text-ink-faint">行 胜过 列</th>
            {rules.map((c) => (
              <th key={c.id} scope="col" className="pb-3 pl-3 text-left align-bottom font-normal text-ink-muted">
                <span aria-hidden className="mb-1.5 block h-[2px] w-3" style={{ background: c.color }} />
                <span className="line-clamp-2">{c.label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.id} className="border-b border-edge">
              <th scope="row" className="py-3 pr-3 text-left font-normal text-ink">
                <span className="flex items-center gap-2"><span aria-hidden className="h-[2px] w-3 shrink-0" style={{ background: r.color }} />{r.label}</span>
              </th>
              {rules.map((c) => {
                if (c.id === r.id) return <td key={c.id} className="pl-3 text-ink-faint">—</td>
                const v = paired[r.id]?.[c.id]?.[metric]
                if (v === undefined) return <td key={c.id} className="pl-3 text-ink-faint">—</td>
                const off = (v - 0.5) * 2
                return (
                  <td key={c.id} className="py-3 pl-3">
                    <span className={`num block text-[12px] ${v >= 0.5 ? 'text-ink' : 'text-ink-muted'}`}>{share(v)}</span>
                    <span aria-hidden className="relative mt-1.5 block h-[3px] w-full max-w-[96px] bg-edge">
                      <span className="absolute left-1/2 top-[-2px] h-[7px] w-px bg-field" />
                      <span className={`absolute top-0 h-full ${v >= 0.5 ? 'bg-ink' : 'bg-ink-faint'}`} style={{ left: off >= 0 ? '50%' : `${50 + off * 50}%`, width: `${Math.abs(off) * 50}%` }} />
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
