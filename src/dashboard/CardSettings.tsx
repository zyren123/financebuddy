import { RANGE_OPTIONS } from '../charts/convert'
import type { RangeKey } from '../charts/convert'
import { MAX_SERIES_PER_CARD } from '../charts/theme'
import type { CardConfig, IndicatorKind, RatioRocCardConfig } from './types'
import { CloseIcon, PlusIcon } from '../ui/icons'

interface Props {
  card: CardConfig
  onChange: (patch: Partial<CardConfig>) => void
}

const inputCls =
  'num w-24 border border-edge bg-void px-2 py-1 text-[11px] text-ink outline-none focus:border-copper'
const labelCls = 'text-ink-muted'

/** 编辑模式下的卡片参数表单(改动写 Draft,发布才对访客生效) */
export function CardSettings({ card, onChange }: Props) {
  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-1 text-[12px]">
      {card.kind === 'candle' && (
        <label className="flex items-center gap-2">
          <span className={labelCls}>Ticker</span>
          <input
            className={inputCls}
            value={card.symbol}
            spellCheck={false}
            onChange={(e) => onChange({ symbol: e.target.value.toUpperCase().trim() } as Partial<CardConfig>)}
          />
        </label>
      )}

      {card.kind === 'ratioRoc' && (
        <>
          <div className="flex items-center gap-2">
            <span className={labelCls}>ROC 周期</span>
            <input
              type="number"
              min={1}
              className={inputCls}
              value={card.rocPeriod}
              onChange={(e) => onChange({ rocPeriod: clampInt(e.target.value, 1) } as Partial<CardConfig>)}
            />
          </div>
          <RatioPairsEditor card={card} onChange={onChange} />
        </>
      )}

      {card.kind === 'indicator' && (
        <>
          <label className="flex items-center gap-2">
            <span className={labelCls}>Ticker</span>
            <input
              className={inputCls}
              value={card.symbol}
              spellCheck={false}
              onChange={(e) => onChange({ symbol: e.target.value.toUpperCase().trim() } as Partial<CardConfig>)}
            />
          </label>
          <label className="flex items-center gap-2">
            <span className={labelCls}>指标</span>
            <select
              className={inputCls}
              value={card.indicator}
              onChange={(e) => onChange({ indicator: e.target.value as IndicatorKind } as Partial<CardConfig>)}
            >
              <option value="rsi">RSI</option>
              <option value="roc">ROC</option>
              <option value="sma">SMA</option>
              <option value="ema">EMA</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className={labelCls}>周期</span>
            <input
              type="number"
              min={1}
              className={inputCls}
              value={card.period}
              onChange={(e) => onChange({ period: clampInt(e.target.value, 1) } as Partial<CardConfig>)}
            />
          </label>
        </>
      )}

      <div className="flex items-center gap-2">
        <span className={labelCls}>默认范围</span>
        <div className="num flex border border-edge">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={`px-2 py-1 ${card.range === opt.key ? 'bg-ink text-void' : 'text-ink-muted hover:text-ink'}`}
              onClick={() => onChange({ range: opt.key as RangeKey } as Partial<CardConfig>)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function RatioPairsEditor({ card, onChange }: { card: RatioRocCardConfig; onChange: Props['onChange'] }) {
  const { pairs } = card
  const canAdd = pairs.length < MAX_SERIES_PER_CARD

  const setPairs = (next: RatioRocCardConfig['pairs']) =>
    onChange({ pairs: next } as Partial<CardConfig>)

  return (
    <div className="flex flex-col gap-1">
      <span className={labelCls}>
        Ratio 对(分子/分母,最多 {MAX_SERIES_PER_CARD} 条)
      </span>
      {pairs.map((p, i) => (
        <div key={i} className="flex items-center gap-1">
          <input
            className={`${inputCls} w-16`}
            value={p.numerator}
            spellCheck={false}
            onChange={(e) =>
              setPairs(
                pairs.map((q, j) =>
                  j === i ? { ...q, numerator: e.target.value.toUpperCase().trim() } : q,
                ),
              )
            }
          />
          <span className="text-ink-muted">/</span>
          <input
            className={`${inputCls} w-16`}
            value={p.denominator}
            spellCheck={false}
            onChange={(e) =>
              setPairs(
                pairs.map((q, j) =>
                  j === i ? { ...q, denominator: e.target.value.toUpperCase().trim() } : q,
                ),
              )
            }
          />
          <button
            type="button"
            className="p-1 text-ink-muted hover:text-down"
            onClick={() => setPairs(pairs.filter((_, j) => j !== i))}
            aria-label="删除此 Ratio"
          >
            <CloseIcon />
          </button>
        </div>
      ))}
      {canAdd && (
        <button
          type="button"
          className="inline-flex w-fit items-center gap-1.5 border border-edge px-2 py-1 text-ink-muted hover:border-copper hover:text-ink"
          onClick={() => setPairs([...pairs, { numerator: '', denominator: 'QQQ' }])}
        >
          <PlusIcon /> 添加 Ratio
        </button>
      )}
    </div>
  )
}

function clampInt(raw: string, min: number): number {
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? Math.max(min, n) : min
}
