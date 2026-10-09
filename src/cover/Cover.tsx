import { useState } from 'react'
import type { RefObject } from 'react'
import { CHART_COLORS } from '../charts/theme'
import { describeDataError } from '../data/errors'
import type { RatioReadings } from '../data/useRatioReadings'
import { CountUp, formatSigned } from '../ui/CountUp'
import { ArrowDownIcon } from '../ui/icons'
import { headlineOf, leadOf, sharedDenominator } from './copy'
import { Detector, trackDelay } from './Detector'
import { ringScale } from './geometry'

interface Props {
  data: RatioReadings
  period: number
  /** 滚动转场的两端:封面的大探测器 → 页头徽记(由 useCoverMorph 驱动) */
  detectorRef: RefObject<HTMLDivElement | null>
  textRefs: [RefObject<HTMLDivElement | null>, RefObject<HTMLDivElement | null>]
  onEnter: () => void
}

export function Cover({ data, period, detectorRef, textRefs, onEnter }: Props) {
  const { readings, loaded, total, error, date } = data
  const [active, setActive] = useState<number | null>(null)
  const fired = readings.length > 0
  const headline = headlineOf(readings)
  const lead = leadOf(readings, period)
  const den = sharedDenominator(readings)
  const { step } = ringScale(readings.flatMap((r) => [r.value, r.previous ?? 0]))

  return (
    <section
      aria-labelledby="cover-title"
      className="relative mx-auto grid min-h-svh max-w-[1440px] grid-cols-1 content-start gap-x-12 px-5 pb-10 pt-5 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:grid-rows-[1fr_auto_auto_1fr] md:px-12 md:pb-16 md:pt-8"
    >
      <div className="num absolute inset-x-5 top-5 flex items-baseline justify-between text-[11px] text-ink-muted md:inset-x-12 md:top-8">
        <span className="font-semibold tracking-[0.06em] text-ink">FINANCEBUDDY</span>
        <span>{date ? `${date} 收盘 · 日线` : '日线 · 美股'}</span>
      </div>

      <div ref={textRefs[0]} className="relative z-10 order-1 mt-14 md:col-start-1 md:row-start-2 md:mt-0">
        <h1
          id="cover-title"
          className="font-display text-[clamp(3.25rem,10vw,6rem)] leading-[0.95] tracking-[-0.01em] text-ink"
        >
          {headline ?? (error ? '暂时读不到' : '等待事例')}
        </h1>
        <p className="mt-4 max-w-[30ch] text-[17px] leading-relaxed text-ink md:mt-6 md:text-lg">
          {lead ??
            (error
              ? describeDataError(error)
              : `正在取数:${loaded}/${total} 个标的(免费配额每分钟 8 次,分批点亮)`)}
        </p>
      </div>

      <div ref={textRefs[1]} className="relative z-10 order-3 md:col-start-1 md:row-start-3">
        <ol className="mt-5 border-t border-edge md:mt-10" aria-label="当前读数">
          {(fired ? readings : []).map((r, i) => (
            <li
              key={r.label}
              className={`grid grid-cols-[auto_1fr_auto] items-baseline gap-x-3 border-b border-edge py-2 transition-opacity duration-300 md:py-3 ${
                active != null && active !== i ? 'opacity-35' : ''
              }`}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
            >
              <span aria-hidden className="h-[3px] w-5 self-center" style={{ backgroundColor: CHART_COLORS.series[i] }} />
              <span className="num text-[13px] text-ink-muted">{r.label}</span>
              <span className="num text-right text-[clamp(1.5rem,4vw,2.25rem)] font-medium leading-none text-ink">
                <CountUp value={r.value} run={fired} delay={trackDelay(i)} />
                <span className="ml-0.5 text-[0.55em] text-ink-muted">%</span>
              </span>
              {r.previous != null && (
                <span className="num col-start-2 col-end-4 text-right text-[11px] text-ink-faint">
                  {period} 日前 {formatSigned(r.previous)}%
                </span>
              )}
            </li>
          ))}
        </ol>

        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 md:mt-8">
          <button
            type="button"
            onClick={onEnter}
            className="group inline-flex items-center gap-3 bg-ink px-5 py-3 text-[15px] font-medium text-void transition-colors duration-200 hover:bg-copper"
          >
            进入图表
            <ArrowDownIcon className="transition-transform duration-300 ease-out group-hover:translate-y-0.5" />
          </button>
          <span className="text-[13px] text-ink-faint">或向下滚动</span>
        </div>

        <p className="mt-8 max-w-[44ch] text-[13px] leading-relaxed text-ink-muted md:mt-10">
          Ratio ROC-{period}:把分子 ETF 的收盘价除以{den ? ` ${den} ` : '分母'}，再算这个比值的 {period}{' '}
          日涨跌幅。为正，分子跑赢；为负，{den ?? '分母'}跑赢。
        </p>
      </div>

      <figure className="relative order-2 m-0 mt-3 md:col-start-2 md:row-span-4 md:row-start-1 md:mt-0 md:self-center">
        <div ref={detectorRef} className="relative z-30 mx-auto aspect-square w-[min(78vw,40svh)] will-change-transform md:w-full md:max-w-[780px]">
          <Detector readings={readings} fired={fired} active={active} onActive={setActive} className="h-full w-full" />
          {!fired && (
            <div className="num absolute inset-0 flex items-center justify-center text-[12px] text-ink-muted">
              {error ? '无事例' : `${loaded}/${total}`}
            </div>
          )}
        </div>
        <figcaption className="num mx-auto mt-2 flex max-w-[780px] flex-wrap justify-center gap-x-5 gap-y-1 text-[11px] text-ink-faint">
          <span>每环 {step}%</span>
          <span>顺时针:{den ?? '分母'}跑赢</span>
          <span>逆时针:分子跑赢</span>
          <span>虚线:{period} 日前</span>
        </figcaption>
      </figure>
    </section>
  )
}
