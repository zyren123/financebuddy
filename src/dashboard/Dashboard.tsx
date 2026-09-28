import { useCallback, useEffect, useRef, useState } from 'react'
import type { RangeKey } from '../charts/convert'
import { useAdmin } from './useAdmin'
import { cardFactories, useDashboard } from './useDashboard'
import { DashboardGrid } from './DashboardGrid'
import type { PresetKey } from './presets'

const btn =
  'rounded border border-edge px-2 py-1 text-[11px] text-ink-muted transition-colors hover:border-ink-muted hover:text-ink'
const btnPrimary = 'rounded bg-accent px-2 py-1 text-[11px] font-medium text-white hover:brightness-110'
const inputCls =
  'w-full rounded border border-edge bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-accent'

/**
 * 应用主体(ADR-0003):访客只读(顶栏无任何编辑入口);
 * Admin 经 #admin / 页脚 ⚙ 登录后可编辑 Draft 并发布,对所有访客生效。
 */
export function Dashboard() {
  const { isAdmin, adminToken, enter, exit } = useAdmin()
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
  } = useDashboard(adminToken)

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
      if ((e.key === 'e' || e.key === 'E') && isAdmin) {
        if (editing) finishEditing()
        else beginEditing()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isAdmin, editing, beginEditing, finishEditing])

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
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-edge bg-surface-raised px-3 py-2">
        <span className="mr-1 text-sm font-semibold tracking-wide text-ink">FinanceBuddy</span>

        {isAdmin && !editing && (
          <button type="button" className={btn} onClick={beginEditing} disabled={state == null}>
            ✎ 编辑布局(E)
          </button>
        )}
        {isAdmin && editing && (
          <>
            <button type="button" className={btnPrimary} onClick={finishEditing}>
              ✓ 完成编辑
            </button>
            <span className="mx-1 h-4 w-px bg-edge" aria-hidden />
            <div className="flex overflow-hidden rounded border border-edge text-[11px]">
              {(
                [
                  { key: 'quad', label: '四宫格' },
                  { key: 'flow', label: '自上而下' },
                ] as Array<{ key: PresetKey; label: string }>
              ).map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className="bg-surface px-2 py-1 text-ink-muted hover:text-ink"
                  onClick={() => applyPreset(p.key)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <span className="mx-1 h-4 w-px bg-edge" aria-hidden />
            <button type="button" className={btn} onClick={() => addCard(cardFactories.candle)}>
              + K 线卡
            </button>
            <button type="button" className={btn} onClick={() => addCard(cardFactories.ratioRoc)}>
              + Ratio ROC 卡
            </button>
            <button type="button" className={btn} onClick={() => addCard(cardFactories.indicator)}>
              + 指标卡
            </button>
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          {isAdmin && editing && (
            <>
              <button
                type="button"
                className={btnPrimary}
                disabled={!dirty || publishing}
                onClick={() => void onPublish()}
              >
                {publishing ? '发布中…' : '发布'}
              </button>
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
            </>
          )}
          {isAdmin && (
            <>
              <button type="button" className={btn} onClick={exportJson}>
                导出布局
              </button>
              <button type="button" className={btn} onClick={exit} title="退出管理员会话">
                退出管理
              </button>
            </>
          )}
        </div>
      </header>

      {ready && state ? (
        <DashboardGrid
          cards={state.cards}
          layout={state.layout}
          editMode={editing}
          rangeOverride={rangeOverride}
          onLayoutChange={setLayout}
          onCardChange={updateCard}
          onCardRemove={removeCard}
          onRangeSelect={onRangeSelect}
        />
      ) : loadFailed ? (
        <div className="flex flex-1 items-center justify-center text-xs text-down">
          布局服务不可用,请稍后刷新重试
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-xs text-ink-muted">正在载入布局…</div>
      )}

      {loginOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setLoginOpen(false)}
        >
          <div
            className="w-72 space-y-3 rounded-lg border border-edge bg-surface-raised p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-medium text-ink">管理员登录</div>
            <input
              autoFocus
              type="password"
              className={inputCls}
              placeholder="发布口令"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void onLogin()
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
    </div>
  )
}
