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
  const [loginState, setLoginState] = useState<'idle' | 'checking' | 'failed'>('idle')
  const [actionMessage, setActionMessage] = useState('')
  // Browse State:浏览态的时间区间偏好,会话内存,刷新即回(不属于布局,不可发布)
  const [rangeOverride, setRangeOverride] = useState<Record<string, RangeKey>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const loginRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!loginOpen) return
    const dialog = loginRef.current
    if (!dialog) return
    const previousFocus = document.activeElement
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled)'))
    controls()[0]?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setLoginOpen(false)
      }
      if (event.key === 'Tab') {
        const items = controls()
        const first = items[0]
        const last = items.at(-1)
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    }
    const containFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) controls()[0]?.focus()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('focusin', containFocus)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('focusin', containFocus)
      if (previousFocus instanceof HTMLElement && previousFocus !== document.body && previousFocus.isConnected) previousFocus.focus()
      else document.querySelector<HTMLElement>('a[href="#top"]')?.focus()
    }
  }, [loginOpen])

  // #admin 入口:命中即弹口令框,并清掉 hash(不留痕)
  useEffect(() => {
    const check = () => {
      if (window.location.hash === '#admin') {
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
        setLoginOpen(true)
        setLoginState('idle')
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
    if (loginState === 'checking' || !password) return
    setLoginState('checking')
    const ok = await enter(password)
    if (ok) {
      setPassword('')
      setLoginOpen(false)
      setLoginState('idle')
    } else {
      setLoginState('failed')
    }
  }, [enter, password, loginState])

  const onImportFile = useCallback(
    async (file: File) => {
      try {
        importJson(await file.text())
        setActionMessage('已导入草稿。发布后才对访客生效。')
      } catch (err) {
        setActionMessage(`导入失败。请使用 FinanceBuddy 导出的 JSON 布局文件重试。${err instanceof Error ? ` ${err.message}` : ''}`)
      }
    },
    [importJson],
  )

  const onPublish = useCallback(async () => {
    try {
      await publish()
      setActionMessage('布局已发布，对所有访客生效。')
    } catch (err) {
      setActionMessage(`发布失败，草稿仍可继续编辑。请检查网络和管理员口令后重试。${err instanceof Error ? ` ${err.message}` : ''}`)
    }
  }, [publish])

  const onRestore = useCallback(async () => {
    if (!confirm('恢复上一版已发布布局？所有访客将看到上一版，当前已发布布局将成为新的上一版。未发布草稿将被清除。')) return
    try {
      await restorePrevious()
      setActionMessage('已恢复上一版布局，对所有访客生效。')
    } catch (err) {
      setActionMessage(`恢复上一版失败，请稍后重试。${err instanceof Error ? ` ${err.message}` : ''}`)
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
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-3 px-5 py-2.5 md:gap-5 md:px-12 lg:flex-nowrap">
          <a href="#top" className="flex shrink-0 items-center gap-2.5" aria-label="回到封面">
            <div ref={emblemRef} className="h-7 w-7 opacity-0">
              <Detector readings={readings.readings} fired active={null} compact className="h-full w-full" />
            </div>
            <span className="num hidden text-[12px] font-semibold tracking-[0.06em] text-ink sm:inline">
              FinanceBuddy
            </span>
          </a>

          <ul className="num flex min-w-0 flex-1 items-baseline gap-x-4 overflow-x-auto text-[12px] md:gap-x-6" aria-label="当前读数">
            {readings.readings.map((r, i) => (
              <li key={r.label} className="flex shrink-0 items-baseline gap-1.5" aria-label={`${r.label} ${formatSigned(r.value)}%`}>
                <span aria-hidden className="h-[2px] w-3 self-center" style={{ backgroundColor: CHART_COLORS.series[i] }} />
                <span className="hidden text-ink-muted lg:inline">{r.label}</span>
                <span className="text-ink">{formatSigned(r.value)}%</span>
              </li>
            ))}
          </ul>

          <div className={`ml-auto flex shrink-0 flex-wrap items-center gap-2 ${isAdmin ? 'md:w-full md:justify-end lg:w-auto' : ''}`}>
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
                  {publishing ? '正在发布布局…' : '发布布局'}
                </button>
                <button type="button" className={btn} onClick={finishEditing}>
                  <CheckIcon /> 返回浏览
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
            <span className="mr-1 text-[11px] text-ink-muted">草稿 · 发布后对访客生效</span>
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
              <PlusIcon /> 添加 K 线卡
            </button>
            <button type="button" className={btn} onClick={() => addCard(cardFactories.ratioRoc)}>
              <PlusIcon /> 添加 Ratio ROC 卡
            </button>
            <button type="button" className={btn} onClick={() => addCard(cardFactories.indicator)}>
              <PlusIcon /> 添加指标卡
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
            Twelve Data 日线{readings.date ? ` · 截至 ${readings.date}` : ''}
          </p>
        </div>

        {actionMessage && <p role="status" className="mb-6 text-[13px] leading-relaxed text-ink-muted">{actionMessage}</p>}
        {isAdmin && narrow && <p className="mb-6 text-[13px] text-ink-muted">布局编辑需使用桌面宽度。当前可浏览图表。</p>}
        {ready && state?.cards.length === 0 && <p role="status" className="mb-6 text-[13px] text-ink-muted">当前布局没有卡片。{canEdit ? '进入编辑布局后添加卡片。' : '请等待管理员发布图表。'}</p>}

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
            <div role="status" className="border border-dashed border-copper-dim px-4 py-3 text-[12px] text-ink-muted">
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
            ref={loginRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-title"
            className="w-80 space-y-4 border border-edge border-t-copper bg-void-raised p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div id="login-title" className="text-[15px] font-medium text-ink">
              管理员登录
            </div>
            <label htmlFor="admin-password" className="block text-[13px] text-ink-muted">发布口令</label>
            <input
              id="admin-password"
              type="password"
              className={inputCls}
              autoComplete="current-password"
              disabled={loginState === 'checking'}
              aria-invalid={loginState === 'failed'}
              aria-describedby={loginState === 'failed' ? 'login-error' : undefined}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setLoginState('idle') }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void onLogin()
              }}
            />
            {loginState === 'failed' && <p id="login-error" role="alert" className="text-[13px] leading-relaxed text-ink-muted">未能验证口令。请检查口令和网络连接后重试。</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className={btn} onClick={() => setLoginOpen(false)}>
                取消
              </button>
              <button type="button" className={btnPrimary} disabled={!password || loginState === 'checking'} onClick={() => void onLogin()}>
                {loginState === 'checking' ? '正在验证口令…' : '登录'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
