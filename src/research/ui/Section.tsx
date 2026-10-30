import type { ReactNode } from 'react'
import { PlusIcon } from '../../ui/icons'

/** 一条实验记录:结论标题 → 配置条 → 解读 → 图表。运行号承载顺序信息,不作装饰眉标 */
export function RunSection({ id, run, title, config, children, lede, archiveOnly }: {
  id: string
  run: string
  title: ReactNode
  /** 配置条里的条目,如 "平稳自助 · 段长 1 年" */
  config?: string[]
  lede: ReactNode
  children?: ReactNode
  /** 结果只来自 Python 归档,浏览器不复跑 */
  archiveOnly?: boolean
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 pt-16 first:pt-0 md:pt-24">
      <h2 id={`${id}-title`} className="max-w-[24ch] font-display text-[clamp(2rem,4vw,3rem)] leading-[1.05] text-ink">{title}</h2>
      {config && (
        <div className="num mt-5 flex flex-wrap gap-x-5 gap-y-1 border-t border-copper-dim pt-3 text-[11px] text-ink-muted">
          <span className="text-copper">{run}</span>
          {config.map((c) => <span key={c}>{c}</span>)}
          {archiveOnly && <span className="text-ink-faint">Python 归档结果 · 浏览器不复跑</span>}
        </div>
      )}
      <div className="mt-5 max-w-[38em] space-y-3 text-[17px] leading-[1.625] text-ink-muted [&_strong]:font-medium [&_strong]:text-ink">{lede}</div>
      {children && <div className="mt-10">{children}</div>}
    </section>
  )
}

export function Table({ caption, children, className = '' }: { caption: string; children: ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full border-collapse text-[12px] ${className}`}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  )
}

export const th = 'pb-3 pr-4 text-left align-bottom text-[11px] font-normal text-ink-faint'
export const thNum = 'pb-3 pl-4 text-right align-bottom text-[11px] font-normal text-ink-faint'
export const td = 'py-2.5 pr-4 text-left align-baseline text-ink'
export const tdNum = 'num py-2.5 pl-4 text-right align-baseline text-ink'

export function Stat({ label, value, note }: { label: ReactNode; value: string; note?: ReactNode }) {
  return (
    <div className="border-t border-edge pt-3">
      <div className="text-[11px] leading-relaxed text-ink-faint">{label}</div>
      <div className="num mt-1.5 text-[clamp(1.5rem,4vw,2.25rem)] font-medium leading-none text-ink">{value}</div>
      {note && <div className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">{note}</div>}
    </div>
  )
}

export function Details({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="group mt-10 border-t border-edge">
      <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-[12px] text-ink-muted transition-colors hover:text-ink">
        {summary}
        <PlusIcon className="text-ink-faint transition-transform duration-200 group-open:rotate-45" />
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  )
}
