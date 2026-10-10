import { useCallback, useMemo, useRef } from 'react'
import { Cover } from './cover/Cover'
import { useCoverMorph } from './cover/useCoverMorph'
import { Dashboard } from './dashboard/Dashboard'
import type { RatioPair } from './dashboard/types'
import { useAdmin } from './dashboard/useAdmin'
import { useDashboard } from './dashboard/useDashboard'
import { useRatioReadings } from './data/useRatioReadings'

/** 布局还没到时封面先用出厂的三条 Ratio 取数(与 Factory Layout 一致) */
const FALLBACK_PAIRS: RatioPair[] = [
  { numerator: 'VTV', denominator: 'QQQ' },
  { numerator: 'SCHD', denominator: 'QQQ' },
  { numerator: 'CGDV', denominator: 'QQQ' },
]
const FALLBACK_PERIOD = 35

/**
 * 同一页连续滚动:封面(探测器 + 结论)→ 仪表盘。
 * 封面读数取自布局里第一张 Ratio ROC 卡,Admin 改了卡片发布后封面跟着变。
 */
export default function App() {
  const admin = useAdmin()
  const dashboard = useDashboard(admin.adminToken)

  const ratioCard = dashboard.state?.cards.find((c) => c.kind === 'ratioRoc')
  const pairs = useMemo(
    () => (ratioCard?.kind === 'ratioRoc' && ratioCard.pairs.length > 0 ? ratioCard.pairs : FALLBACK_PAIRS),
    [ratioCard],
  )
  const period = ratioCard?.kind === 'ratioRoc' ? ratioCard.rocPeriod : FALLBACK_PERIOD
  const readings = useRatioReadings(pairs, period)

  const coverRef = useRef<HTMLDivElement>(null)
  const detectorRef = useRef<HTMLDivElement>(null)
  const textTopRef = useRef<HTMLDivElement>(null)
  const textBottomRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLElement>(null)
  const emblemRef = useRef<HTMLDivElement>(null)
  const texts = useMemo(() => [textTopRef, textBottomRef], [])

  useCoverMorph(
    { cover: coverRef, detector: detectorRef, texts, emblem: emblemRef, header: headerRef },
    dashboard.ready,
  )

  const enterCharts = useCallback(() => {
    document.getElementById('charts')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <main>
      <div id="top" ref={coverRef}>
        <Cover
          data={readings}
          period={period}
          detectorRef={detectorRef}
          textRefs={[textTopRef, textBottomRef]}
          onEnter={enterCharts}
        />
      </div>
      <Dashboard
        admin={admin}
        dashboard={dashboard}
        readings={readings}
        headerRef={headerRef}
        emblemRef={emblemRef}
      />
    </main>
  )
}
