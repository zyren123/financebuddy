import { MARKET_SOURCES } from './model'
import { useMarketData } from './useMarketData'
import type { Reading } from './useMarketData'

function Readout({ reading, unit, digits = 1, large = false }: { reading: Reading; unit?: string; digits?: number; large?: boolean }) {
  if (reading.kind !== 'ready') {
    return <div className="py-1" aria-busy={reading.kind === 'loading'}>
      <span aria-hidden className="num text-xl text-ink-faint">—</span>
      <span className="mt-1 block text-[11px] leading-relaxed text-ink-faint">{reading.kind === 'loading' ? '正在读取' : reading.label}</span>
    </div>
  }
  const old = Date.now() - Date.parse(reading.date) > 7 * 86_400_000
  const value = Math.abs(reading.value) < 0.5 * 10 ** -digits ? 0 : reading.value
  return <div>
    <span className={`num font-medium leading-none text-ink ${large ? 'text-[28px] md:text-[32px]' : 'text-[20px] md:text-[24px]'}`}>
      {value.toFixed(digits).replace('-', '−')}<span className="ml-1 text-[11px] font-normal text-ink-muted">{unit}</span>
    </span>
    <span className="num mt-2 block text-[11px] leading-relaxed text-ink-faint">{reading.date}{old ? ' · 较早数据' : ''}</span>
  </div>
}

export function MarketOverview({ active }: { active: boolean }) {
  const data = useMarketData(active)
  const rows = [
    { title: 'RSI', detail: '6 日 · Wilder 平滑', key: 'rsi', digits: 1 },
    { title: '距 52 周高点', detail: '当前回撤', key: 'drawdown', digits: 1, unit: '%' },
    { title: '市盈率', detail: 'PE · TTM', key: 'pe', digits: 1, unit: '倍' },
    { title: 'PE 百分位', detail: '近 10 年 · 来源统计', key: 'percentile', digits: 1, unit: '%' },
  ] as const
  return (
    <section aria-label="美股指标" className="border-t border-copper-dim pt-6">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 className="text-[15px] font-medium text-ink">指数对照</h2>
        {data.hasFailures ? (
          <button type="button" onClick={() => void data.retryFailures()} disabled={data.fetching} className="border border-edge px-2.5 py-1.5 text-[12px] text-ink-muted transition-colors hover:border-copper hover:text-ink disabled:opacity-40">
            {data.fetching ? '正在重试…' : '重试缺失数据'}
          </button>
        ) : <p className="text-[11px] text-ink-faint" role="status">{data.fetching ? '各来源正在分别载入…' : '每项读数标注自己的数据日期'}</p>}
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.7fr)_minmax(240px,1fr)] lg:gap-14">
        <table className="w-full table-fixed border-collapse text-[13px]">
          <caption className="sr-only">标普 500 与纳斯达克 100 指标对照</caption>
          <thead>
            <tr className="border-b border-edge text-right text-[11px] text-ink-muted">
              <th scope="col" className="w-[38%] pb-4 text-left font-normal lg:w-[42%]">指标</th>
              <th scope="col" className="pb-4 pl-2 font-normal"><span className="block text-[12px] font-medium text-ink">标普 500</span><span className="num mt-1 block">S&amp;P 500</span></th>
              <th scope="col" className="pb-4 pl-2 font-normal"><span className="block text-[12px] font-medium text-ink">纳斯达克 100</span><span className="num mt-1 block text-[10px] sm:text-[11px]">NASDAQ 100</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => <tr key={row.key} className="border-b border-edge">
              <th scope="row" className="py-5 pr-2 text-left align-middle font-normal text-ink">
                {row.title}<span className="mt-1 block text-[11px] leading-relaxed text-ink-faint">{row.detail}</span>
              </th>
              {(['sp500', 'nasdaq100'] as const).map((index) => <td key={index} className="py-5 pl-2 text-right align-middle">
                <Readout reading={data.indices[index][row.key]} unit={'unit' in row ? row.unit : undefined} digits={row.digits} />
              </td>)}
            </tr>)}
          </tbody>
        </table>

        <section aria-labelledby="sentiment-title">
          <h3 id="sentiment-title" className="mb-3 text-[13px] font-medium text-ink-muted">市场情绪</h3>
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-1 lg:gap-8">
            <article className="border-t border-copper-dim pt-4 lg:pt-5">
              <h4 className="text-[13px] text-ink">VIX</h4>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">最近完成交易日收盘</p>
              <div className="mt-5"><Readout reading={data.vix} digits={2} large /></div>
            </article>
            <article className="border-t border-copper-dim pt-4 lg:pt-5">
              <h4 className="text-[13px] text-ink">CNN 恐惧贪婪指数</h4>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">来源最新发布值</p>
              <div className="mt-5"><Readout reading={data.fearGreed} digits={1} unit="/ 100" large /></div>
            </article>
          </div>
        </section>
      </div>

      <details className="mt-8 border-t border-edge text-[13px] text-ink-muted">
        <summary className="cursor-pointer py-4 text-[12px] text-ink-muted transition-colors hover:text-ink">指标口径、来源与缺失数据</summary>
        <div className="max-w-[75ch] space-y-3 pb-2 leading-relaxed">
          <p>RSI(6) 使用指数已完成交易日的收盘价，采用 Wilder 平滑。52 周回撤 = 最近收盘价 ÷ 过去 52 周最高日内价 − 1；历史不足 52 周时不显示回撤。</p>
          <p>TTM PE 与 PE 百分位取自蛋卷基金同一估值表。百分位采用来源的近 10 年统计（历史不足时用全部历史），不是当前 PE 在区间最高 / 最低值之间的位置。</p>
          <p>CNN 官方来源若不可访问，会明确显示缺失，不以其他情绪指数替代。超过 7 个日历日的读数会标注「较早数据」。</p>
          <p>价格、估值与情绪独立更新，各项日期可能不同。来源暂不可用时可点击「重试缺失数据」，其他已载入读数可继续查看。</p>
          <p className="flex flex-wrap gap-x-5 gap-y-2 pt-1 text-[12px]">
            {Object.entries(MARKET_SOURCES).map(([key, source]) => <a key={key} href={source.url} target="_blank" rel="noopener noreferrer" className="text-ink underline decoration-field underline-offset-4 transition-colors hover:decoration-copper">{source.name}<span className="sr-only">（新标签页打开）</span></a>)}
            <a href="https://danjuanfunds.com/article/337.html" target="_blank" rel="noopener noreferrer" className="text-ink underline decoration-field underline-offset-4 transition-colors hover:decoration-copper">估值统计方法<span className="sr-only">（新标签页打开）</span></a>
          </p>
        </div>
      </details>
    </section>
  )
}
