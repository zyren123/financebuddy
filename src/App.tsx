import { useCallback, useMemo, useRef } from 'react'
import { Cover } from './cover/Cover'
import { useCoverMorph } from './cover/useCoverMorph'
import { Dashboard } from './dashboard/Dashboard'
import { useAdmin } from './dashboard/useAdmin'
import { useDashboard } from './dashboard/useDashboard'
import { usePressFeedback } from './motion/usePressFeedback'
import { useCoverReadings } from './readings/useCoverReadings'
import { usePrefetchBars } from './readings/usePrefetchBars'

/**
 * 同一页连续滚动:封面(探测器 + 结论)→ 仪表盘。
 * 封面读数取自布局里第一张 Ratio ROC 卡,Admin 改了卡片发布后封面跟着变。
 */
export default function App() {
  usePressFeedback()
  const admin = useAdmin()
  const dashboard = useDashboard(admin.adminToken)
  const readings = useCoverReadings(dashboard)
  usePrefetchBars(dashboard.state)

  const coverRef = useRef<HTMLDivElement>(null)
  const detectorRef = useRef<HTMLDivElement>(null)
  const detectorSlotRef = useRef<HTMLDivElement>(null)
  const textTopRef = useRef<HTMLDivElement>(null)
  const textBottomRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLElement>(null)
  const emblemRef = useRef<HTMLDivElement>(null)
  const texts = useMemo(() => [textTopRef, textBottomRef], [])

  useCoverMorph(
    { cover: coverRef, origin: detectorSlotRef, detector: detectorRef, texts, emblem: emblemRef, header: headerRef },
  )

  const enterCharts = useCallback(() => {
    document.getElementById('charts')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })
  }, [])

  return (
    <main>
      <div id="top" ref={coverRef}>
        <Cover
          data={readings}
          period={readings.period}
          detectorRef={detectorRef}
          detectorSlotRef={detectorSlotRef}
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
