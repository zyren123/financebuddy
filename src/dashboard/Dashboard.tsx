import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { RangeKey } from '../charts/convert'
import { CHART_COLORS } from '../charts/theme'
import { Detector } from '../cover/Detector'
import type { RatioReadings } from '../data/useRatioReadings'
import { formatSigned } from '../ui/CountUp'
import { CheckIcon, PencilIcon, PlusIcon } from '../ui/icons'
import { useMediaQuery } from '../ui/useMediaQuery'
import type { useAdmin } from './useAdmin'
import { cardFactories } from './useDashboard'
import type { useDashboard } from './useDashboard'
import { DashboardGrid } from './DashboardGrid'
import type { PresetKey } from './presets'

const btn =
  'inline-flex items-center gap-1.5 border border-edge px-2.5 py-1.5 text-[12px] text-ink-muted transition-colors duration-150 hover:border-copper hover:text-ink disabled:opacity-40 disabled:hover:border-edge disabled:hover:text-ink-muted'
const btnPrimary =
  'inline-flex items-center gap-1.5 bg-ink px-2.5 py-1.5 text-[12px] font-medium text-void transition-colors duration-150 hover:bg-ink-muted disabled:opacity-40 disabled:hover:bg-ink'
const inputCls =
  'w-full border border-field bg-void px-3 py-2 text-[13px] text-ink outline-none focus:border-copper'

interface Props {
  admin: ReturnType<typeof useAdmin>
  dashboard: ReturnType<typeof useDashboard>
  readings: RatioReadings
  headerRef: RefObject<HTMLElement | null>
  emblemRef: RefObject<HTMLDivElement | null>
}

/**
 * 仪表盘(ADR-0003):访客只读(顶栏无任何编辑入口);
 * Admin 经 #admin 登录后可编辑 Draft 并发布,对所有访客生效。
 * 吸顶页头里的徽记是封面探测器滚动转场的落点。
 */
export function Dashboard({ admin, dashboard, readings, headerRef, emblemRef }: Props) {
  const { isAdmin, enter, exit } = admin
  const {
    state,
    ready,
    loadFailed,
    editing,
    dirty,
    publishing,
    beginEditing,
    finishEditing,
    discardDraft,
    publish,
    restorePrevious,
    updateCard,
    removeCard,
    addCard,
    applyPreset,
    setLayout,
    importJson,
    exportJson,
  } = dashboard
  // 手机端不开放布局编辑:单列堆叠,拖拽没有意义
  const narrow = useMediaQuery('(max-width: 767px)')
  const canEdit = isAdmin && !narrow

  const [loginOpen, setLoginOpen] = useState(false)
  const [password, setPassword] = useState('')
  // Browse State:浏览态的时间区间偏好,会话内存,刷新即回(不属于布局,不可发布)
  const [rangeOverride, setRangeOverride] = useState<Record<string, RangeKey>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  // #admin 入口:命中即弹口令框,并清掉 hash(不留痕)
  useEffect(() => {
    const check = () => {
      if (window.location.hash === '#admin') {
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
        setLoginOpen(true)
      }
    }
    check()
    window.addEventListener('hashchange', check)
    return () => window.removeEventListener('hashchange', check)
  }, [])

  // 快捷键 E:仅 Admin 可切换编辑/浏览
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return
      if ((e.key === 'e' || e.key === 'E') && canEdit) {
        if (editing) finishEditing()
        else beginEditing()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canEdit, editing, beginEditing, finishEditing])

  const onLogin = useCallback(async () => {
    const ok = await enter(password)
    setPassword('')
    setLoginOpen(false)
    if (!ok) alert('口令错误')
  }, [enter, password])

  const onImportFile = useCallback(
    async (file: File) => {
      try {
        importJson(await file.text())
      } catch (err) {
        alert(err instanceof Error ? err.message : '导入失败')
      }
    },
    [importJson],
  )

  const onPublish = useCallback(async () => {
    try {
      await publish()
    } catch (err) {
      alert(err instanceof Error ? err.message : '发布失败')
    }
  }, [publish])

  const onRestore = useCallback(async () => {
    if (!confirm('恢复上一版?当前 Published 将被替换(它本身会成为新的上一版)。')) return
    try {
      await restorePrevious()
    } catch (err) {
      alert(err instanceof Error ? err.message : '恢复失败')
    }
  }, [restorePrevious])

  /** 时间区间:编辑态改 Draft 的默认范围;浏览态是 Browse State(会话内存) */
  const onRangeSelect = useCallback(
    (id: string, key: RangeKey) => {
      if (editing) updateCard(id, { range: key })
      else setRangeOverride((prev) => ({ ...prev, [id]: key }))
    },
    [editing, updateCard],
  )

  return (
    <section id="charts" aria-label="图表" className="relative min-h-svh">
      <header
        ref={headerRef}
        className="sticky top-0 z-20 border-b border-edge bg-void"
      >
        <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-5 py-2.5 md:gap-5 md:px-12">
          <a href="#top" className="flex shrink-0 items-center gap-2.5" aria-label="回到封面">
            <div ref={emblemRef} className="h-7 w-7 opacity-0">
              <Detector readings={readings.readings} fired active={null} compact className="h-full w-full" />
            </div>
            <span className="num hidden text-[12px] font-semibold tracking-[0.06em] text-ink sm:inline">
              FinanceBuddy
            </span>
          </a>

          <ul className="num flex min-w-0 items-baseline gap-x-4 overflow-x-auto text-[12px] md:gap-x-6" aria-label="当前读数">
            {readings.readings.map((r, i) => (
              <li key={r.label} className="flex shrink-0 items-baseline gap-1.5">
                <span aria-hidden className="h-[2px] w-3 self-center" style={{ backgroundColor: CHART_COLORS.series[i] }} />
                <span className="hidden text-ink-muted lg:inline">{r.label}</span>
                <span className="text-ink">{formatSigned(r.value)}%</span>
              </li>
            ))}
          </ul>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {canEdit && !editing && (
              <button type="button" className={btn} onClick={beginEditing} disabled={state == null}>
                <PencilIcon /> 编辑布局(E)
              </button>
            )}
            {canEdit && editing && (
              <>
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={!dirty || publishing}
                  onClick={() => void onPublish()}
                >
                  {publishing ? '发布中…' : '发布'}
                </button>
                <button type="button" className={btn} onClick={finishEditing}>
                  <CheckIcon /> 完成编辑
                </button>
              </>
            )}
            {isAdmin && (
              <>
                <button type="button" className={`${btn} hidden md:inline-flex`} onClick={exportJson}>
                  导出布局
                </button>
                <button type="button" className={btn} onClick={exit} title="退出管理员会话">
                  退出管理
                </button>
              </>
            )}
          </div>
        </div>

        {canEdit && editing && (
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-2 border-t border-edge px-5 py-2 md:px-12">
            <span className="num mr-1 text-[11px] text-copper">草稿</span>
            {(
              [
                { key: 'quad', label: '四宫格' },
                { key: 'flow', label: '自上而下' },
              ] as Array<{ key: PresetKey; label: string }>
            ).map((p) => (
              <button key={p.key} type="button" className={btn} onClick={() => applyPreset(p.key)}>
                {p.label}
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-edge" aria-hidden />
            <button type="button" className={btn} onClick={() => addCard(cardFactories.candle)}>
              <PlusIcon /> K 线卡
            </button>
            <button type="button" className={btn} onClick={() => addCard(cardFactories.ratioRoc)}>
              <PlusIcon /> Ratio ROC 卡
            </button>
            <button type="button" className={btn} onClick={() => addCard(cardFactories.indicator)}>
              <PlusIcon /> 指标卡
            </button>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={btn}
                onClick={() => {
                  if (confirm('放弃未发布的修改?')) discardDraft()
                }}
              >
                放弃修改
              </button>
              <button type="button" className={btn} onClick={() => void onRestore()}>
                恢复上一版
              </button>
              <button type="button" className={btn} onClick={() => fileInputRef.current?.click()}>
                导入草稿
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void onImportFile(file)
                  e.target.value = ''
                }}
              />
            </div>
          </div>
        )}
      </header>

      <div className="mx-auto max-w-[1440px] px-5 pb-24 pt-8 md:px-12 md:pt-12">
        <div className="mb-8 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 md:mb-10">
          <h2 className="font-display text-[clamp(2rem,4vw,3rem)] leading-none text-ink">核对图表</h2>
          <p className="num text-[11px] text-ink-faint">
            Twelve Data 日线{readings.date ? ` · 截至 ${readings.date}` : ''} · 指标在浏览器内计算
          </p>
        </div>

        {ready && state ? (
          <DashboardGrid
            cards={state.cards}
            layout={state.layout}
            editMode={editing && canEdit}
            stacked={narrow}
            rangeOverride={rangeOverride}
            onLayoutChange={setLayout}
            onCardChange={updateCard}
            onCardRemove={removeCard}
            onRangeSelect={onRangeSelect}
          />
        ) : (
          <div className="flex h-64 items-center justify-center">
            <div className="border border-dashed border-copper-dim px-4 py-3 text-[12px] text-ink-muted">
              {loadFailed ? '布局服务暂时不可用,稍后刷新重试' : '正在载入布局…'}
            </div>
          </div>
        )}
      </div>

      {loginOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 p-4"
          onClick={() => setLoginOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-title"
            className="w-80 space-y-4 border border-edge border-t-copper bg-void-raised p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div id="login-title" className="text-[15px] font-medium text-ink">
              管理员登录
            </div>
            <input
              autoFocus
              type="password"
              className={inputCls}
              placeholder="发布口令"
              aria-label="发布口令"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void onLogin()
                if (e.key === 'Escape') setLoginOpen(false)
              }}
            />
            <div className="flex justify-end gap-2">
              <button type="button" className={btn} onClick={() => setLoginOpen(false)}>
                取消
              </button>
              <button type="button" className={btnPrimary} onClick={() => void onLogin()}>
                登录
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
