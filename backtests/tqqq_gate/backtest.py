"""TQQQ Gate: independently reconstructed signals and close-executed portfolios."""
import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from market_data import read_series
from spysim import load_sma_input

ROOT = Path(__file__).resolve().parent


@dataclass(frozen=True)
class Parameters:
    short_window: int = 20
    long_window: int = 250
    vol_limit: float = 0.35
    shock_limit: float = 1.10
    exit_drawdown: float = -0.20
    reenter_drawdown: float = -0.10
    confirmation_days: int = 2


def confirm(verdict, valid, days=2):
    """Confirm both directions; begin defensive and ignore warm-up rows."""
    state, streak, previous = 0, 0, None
    states = []
    for today, ready in zip(verdict, valid):
        if not ready:
            streak, previous = 0, None
        else:
            today = int(today)
            streak = streak + 1 if today == previous else 1
            previous = today
            if streak >= days:
                state = today
        states.append(state)
    return pd.Series(states, index=verdict.index, dtype=int)


def signals(close, params=Parameters()):
    returns = close.pct_change(fill_method=None)
    short = returns.rolling(params.short_window).std(ddof=1) * np.sqrt(252)
    long = returns.rolling(params.long_window).std(ddof=1) * np.sqrt(252)
    shock = short / long
    drawdown = close / close.rolling(params.long_window).max() - 1
    valid = long.notna() & shock.notna()
    dd_states = drawdown_gate(drawdown, valid, params)
    frame = pd.DataFrame({"signal_close": close, "vol20": short, "vol250": long, "shock": shock,
                          "index_drawdown": drawdown, "dd_gate": dd_states, "valid": valid})
    frame["vol_gate"] = short < params.vol_limit
    frame["shock_gate"] = shock < params.shock_limit
    frame["verdict"] = frame.vol_gate & frame.shock_gate & frame.dd_gate & valid
    frame["signal"] = confirm(frame.verdict, valid, params.confirmation_days)
    return frame


def drawdown_gate(drawdown, valid, params=Parameters()):
    dd_open = True
    dd_states = []
    for dd, ready in zip(drawdown, valid):
        if ready:
            if dd < params.exit_drawdown:
                dd_open = False
            elif dd > params.reenter_drawdown:
                dd_open = True
        dd_states.append(dd_open)
    return pd.Series(dd_states, index=drawdown.index)


def sma_band_signals(close, window=200, band=0.04):
    """Enter above the upper SMA band; exit below the lower; retain state between."""
    average = close.rolling(window, min_periods=window).mean()
    upper = average * (1 + band)
    lower = average * (1 - band)
    state = 0
    states = []
    for price, high, low in zip(close, upper, lower):
        if pd.notna(high):
            if price > high:
                state = 1
            elif price < low:
                state = 0
        states.append(state)
    return pd.DataFrame({"signal_close": close, "sma200": average, "upper_band": upper, "lower_band": lower,
                         "distance_from_sma": close / average - 1, "valid": average.notna(),
                         "signal": pd.Series(states, index=close.index, dtype=int)})


def portfolio(risk_return, defensive_return, target_at_close, switch_cost_bps=2.5):
    """target_at_close[t] is bought AFTER earning the previous holding's return on t."""
    frame = pd.DataFrame({"risk_return": risk_return, "defensive_return": defensive_return,
                          "position_close": target_at_close.astype(int)})
    frame["position_earning"] = frame.position_close.shift(1).fillna(0).astype(int)
    frame["switch"] = frame.position_close.ne(frame.position_close.shift(1))
    # Initial purchase costs the same amount for every strategy/benchmark.
    frame["cost_fraction"] = frame.switch.astype(float) * switch_cost_bps / 10000
    frame["gross_return"] = np.where(frame.position_earning == 1, frame.risk_return, frame.defensive_return)
    frame.iloc[0, frame.columns.get_loc("gross_return")] = 0.0
    frame["net_return"] = (1 + frame.gross_return) * (1 - frame.cost_fraction) - 1
    frame["equity"] = (1 + frame.net_return).cumprod()
    # Include the initial $1 in the running peak, including an initial-cost drawdown.
    frame["drawdown"] = frame.equity / frame.equity.cummax().clip(lower=1) - 1
    return frame


def metrics(frame, risk_free):
    years = (frame.index[-1] - frame.index[0]).days / 365.25
    daily = frame.net_return.iloc[1:]
    excess = daily - risk_free.reindex(daily.index)
    changes = frame.position_close.diff().fillna(0)
    return {"start": str(frame.index[0].date()), "end": str(frame.index[-1].date()), "sessions": len(frame),
            "cagr": float(frame.equity.iloc[-1] ** (1 / years) - 1), "total_return": float(frame.equity.iloc[-1] - 1),
            "max_drawdown": float(frame.drawdown.min()), "volatility": float(daily.std(ddof=1) * np.sqrt(252)),
            "sharpe": float(excess.mean() / excess.std(ddof=1) * np.sqrt(252)) if excess.std(ddof=1) > 0 else None,
            "growth_of_1": float(frame.equity.iloc[-1]), "risk_exposure": float(frame.position_earning.iloc[1:].mean()),
            "switches": int(frame.switch.iloc[1:].sum()), "completed_exits": int((changes == -1).sum()),
            "switches_per_year": float(frame.switch.iloc[1:].sum() / years)}


def aligned(series, index, name):
    values = series.reindex(index)
    if values.isna().any():
        missing = values.index[values.isna()]
        raise ValueError(f"{name}: missing {len(missing)} trading dates, first {missing[0].date()}; refusing to fill asset prices")
    return values


def annual_returns(frame):
    return (1 + frame.net_return).groupby(frame.index.year).prod() - 1


def write_report(output, results, assumptions, annual, paths, sensitivity, **report_options):
    from report import render
    (output / "report.html").write_text(render(results, assumptions, annual, paths, sensitivity, **report_options), encoding="utf-8")
    lines = ["# TQQQ Gate 本地回测", "", *[f"- {line}" for line in assumptions], "",
             "| 策略 | 年化收益 | 最大回撤 | Sharpe | 期末/$1 | TQQQ持仓时间 | 换仓次数 |",
             "|---|---:|---:|---:|---:|---:|---:|"]
    for name, m in results.items():
        lines.append(f"| {name} | {m['cagr']:.2%} | {m['max_drawdown']:.2%} | {m['sharpe']:.2f} | {m['growth_of_1']:.2f} | {m['risk_exposure']:.1%} | {m['switches']} |")
    lines.extend(["", "年度收益、逐日指标、净值、成交与成本/时点敏感性见同目录 CSV。", "", "本结果是独立规则复算；数据源、时间窗、执行时点均与作者的完整历史口径有差异。"])
    (output / "summary.md").write_text("\n".join(lines), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", default="2010-02-11", help="First portfolio valuation close")
    parser.add_argument("--end", default="2026-10-13")
    parser.add_argument("--signal", choices=("ndx", "qqq"), default="ndx")
    parser.add_argument("--sma-basis", choices=("spysim", "price"), default="spysim", help="SMA signal basis; spysim is a dividend-reinvested approximation")
    parser.add_argument("--execution-lag", type=int, choices=(0, 1, 2), default=1,
                        help="Close delay: 1 = next close; 0 = optimistic signal close (one-row return lag)")
    parser.add_argument("--switch-cost-bps", type=float, default=2.5)
    parser.add_argument("--synthetic", action="store_true", help="Separate long-history proxy: NDX price returns before real TQQQ")
    parser.add_argument("--output", type=Path, default=ROOT / "results")
    parser.add_argument("--data-dir", type=Path, default=ROOT / "data", help="Explicit snapshot directory; no silent provider fallback")
    args = parser.parse_args()
    if not 0 <= args.switch_cost_bps < 10000:
        parser.error("Cost must be between 0 and 10000 bps")
    data, output = args.data_dir, args.output
    output.mkdir(parents=True, exist_ok=True)
    ndx = read_series(data / "NASDAQ100.csv")
    rate_path = data / "IRX.csv" if (data / "IRX.csv").exists() else data / "DTB3.csv"
    rate = read_series(rate_path)
    prices = {s: read_series(data / f"{s}.csv") for s in ("TQQQ", "QQQ", "TLT")}
    if any((s <= 0).any() for s in [ndx, *prices.values()]):
        raise ValueError("All prices must be positive")
    last = min(pd.Timestamp(args.end), *(s.index[-1] for s in [ndx, *prices.values()]))
    signal_price = ndx if args.signal == "ndx" else read_series(data / "QQQ_signal.csv")
    full_signal = signals(signal_price.loc[:last])
    ma_prices, ma_sources, ma_metadata = load_sma_input(data, last, args.sma_basis)
    ma_label = ma_metadata["strategy_label"]
    ma_signal = sma_band_signals(ma_prices)
    ma_signal["source"] = ma_sources
    if full_signal.loc[:args.start, "valid"].sum() < 2:
        raise ValueError("Insufficient indicator warm-up before start")
    first = max(pd.Timestamp(args.start), prices["TQQQ"].index[0])
    index = prices["TQQQ"].loc[first:last].index
    if len(index) < 3:
        raise ValueError("Date window too short")
    # Carry a prior available rate forward, then lag one signal session.
    rf_full = rate.reindex(rate.index.union(signal_price.index)).sort_index().ffill().reindex(signal_price.index).shift(1) / 100 / 252
    risk_free = aligned(rf_full, index, "T-bill rate")
    all_returns = {s: p.pct_change(fill_method=None) for s, p in prices.items()}
    for series in all_returns.values():
        series.iloc[0] = 0.0
    returns = {s: aligned(r, index, s) for s, r in all_returns.items()}
    # The first valuation close precedes the first earned daily return.
    target = aligned(full_signal.signal.shift(args.execution_lag), index, "signal").astype(int)
    ma_target = aligned(ma_signal.signal.shift(args.execution_lag), index, "SMA200 signal").astype(int)
    frames = {
        "TQQQ / T-bill": portfolio(returns["TQQQ"], risk_free, target, args.switch_cost_bps),
        "TQQQ / TLT": portfolio(returns["TQQQ"], returns["TLT"], target, args.switch_cost_bps),
        "TQQQ buy & hold": portfolio(returns["TQQQ"], risk_free, pd.Series(1, index=index), args.switch_cost_bps),
        "QQQ buy & hold": portfolio(returns["QQQ"], risk_free, pd.Series(1, index=index), args.switch_cost_bps),
        f"{ma_label} / T-bill": portfolio(returns["TQQQ"], risk_free, ma_target, args.switch_cost_bps),
        f"{ma_label} / TLT": portfolio(returns["TQQQ"], returns["TLT"], ma_target, args.switch_cost_bps),
    }
    results = {name: metrics(frame, risk_free) for name, frame in frames.items()}
    # QQQ benchmark's risk exposure does not mean TQQQ exposure.
    results["QQQ buy & hold"]["risk_exposure"] = 0.0
    annual = pd.DataFrame({name: annual_returns(frame) for name, frame in frames.items()})
    equity = pd.DataFrame({name: frame.equity for name, frame in frames.items()})
    dd = pd.DataFrame({name: frame.drawdown for name, frame in frames.items()})
    annual.to_csv(output / "annual_returns.csv", index_label="year")
    equity.to_csv(output / "equity.csv", index_label="date")
    dd.to_csv(output / "drawdown.csv", index_label="date")
    full_signal.to_csv(output / "signals.csv", index_label="date")
    ma_signal.to_csv(output / "sma200_signals.csv", index_label="date")
    rows = []
    for name, frame in frames.items():
        trades = frame.loc[frame.switch, ["position_close", "cost_fraction", "equity"]].copy()
        trades.insert(0, "strategy", name)
        # Source signal date is deliberately explicit, including warm-up history.
        strategy_signal = ma_signal if name.startswith(ma_label) else full_signal
        source_dates = pd.Series(strategy_signal.index, index=strategy_signal.index).shift(args.execution_lag)
        trades["signal_date"] = source_dates.reindex(trades.index) if "buy & hold" not in name else pd.NaT
        trades["asset_after_close"] = np.where(trades.position_close == 1, "QQQ" if name.startswith("QQQ buy") else "TQQQ", "TLT" if name.endswith("TLT") else "T-bill")
        rows.append(trades)
        filename = name.replace("+/-", "band_").replace("%", "pct").replace(" / ", "_").replace(" & ", "_").replace(" ", "_")
        frame.to_csv(output / f"{filename}_daily.csv", index_label="date")
    pd.concat(rows).to_csv(output / "trades.csv", index_label="execution_close_date")
    sensitivities = []
    for lag in (0, 1, 2):
        for cost in (0.0, 2.5, 5.0, 10.0):
            for rule, source in (("Three gates", full_signal), (ma_label, ma_signal)):
                for defensive in ("T-bill", "TLT"):
                    p = portfolio(returns["TQQQ"], risk_free if defensive == "T-bill" else returns["TLT"],
                                  aligned(source.signal.shift(lag), index, "sensitivity signal"), cost)
                    sensitivities.append({"strategy": f"{rule} / {defensive}", "defensive": defensive,
                                          "execution_lag": lag, "switch_cost_bps": cost, **metrics(p, risk_free)})
    sensitivity = pd.DataFrame(sensitivities)
    sensitivity.to_csv(output / "sensitivity.csv", index=False)
    signal_compare = None
    if (data / "QQQ_signal.csv").exists():
        qqq_signal = signals(read_series(data / "QQQ_signal.csv"))
        shared = full_signal.index.intersection(qqq_signal.index)
        shared = shared[(shared >= first) & (shared <= last)]
        valid = full_signal.loc[shared, "valid"] & qqq_signal.loc[shared, "valid"]
        comparison = pd.DataFrame({"main_signal": full_signal.loc[shared, "signal"], "qqq_signal": qqq_signal.loc[shared, "signal"]})[valid]
        comparison.to_csv(output / "signal_comparison.csv", index_label="date")
        signal_compare = {"sessions": len(comparison), "different": int(comparison.main_signal.ne(comparison.qqq_signal).sum())}
    manifest = json.loads((data / "manifest.json").read_text()) if (data / "manifest.json").exists() else {}
    provider = manifest.get("provider", "Twelve Data / FRED")
    assumptions = [
        f"真实基金区间：{first.date()} — {last.date()}，{len(index):,} 个估值收盘；初始 $1，分红再投资，税前，无定投。",
        f"信号：{'Nasdaq-100 指数收盘' if args.signal == 'ndx' else 'QQQ 拆股复权收盘（不含分红）'}；20/250 日样本波动；250 日滚动高点；双向连续 2 日确认。",
        f"均线对照：{ma_metadata['display_basis']} 高于 SMA200×1.04 买入 TQQQ，低于 SMA200×0.96 退出；中间保持原仓位，单日触发，按设定延迟成交。",
        ma_metadata["model_note"],
        f"收盘执行延迟 {args.execution_lag} 天。默认 1：t 日信号在 t+1 收盘成交，新仓获得 t+1→t+2 收益；0 是偏乐观的信号当日收盘成交。",
        f"每次资产切换总成本 {args.switch_cost_bps:g} bp（两次切换往返 {2 * args.switch_cost_bps:g} bp）；初次建仓同样扣费，期末不强制平仓。",
        f"数据来源：{provider}；ETF 为拆股及分红复权收益，已包含基金费率，不重复扣费。价格缺失拒绝填补。",
        f"现金：{'Yahoo ^IRX' if rate_path.name == 'IRX.csv' else 'FRED DTB3'} 的 3 月期国库券贴现报价，上一交易日可得值 /100/252；是计息代理，未模拟实券交易或贴现率转投资收益率。",
        "Sharpe 使用现金代理作无风险收益；CAGR 按实际自然日跨度，波动/Sharpe 按 252 交易日年化。",
        "原文 1985–2026 包含合成 TQQQ、重构债券，与本报告真实 ETF 区间不可直接比较；本报告没有复现税务递延变体。",
        f"请求截至 {args.end}；各资产最近共同可用日为 {last.date()}，晚于该日的数据不参与。",
    ]
    if signal_compare:
        assumptions.append(f"QQQ 与主信号在 {signal_compare['sessions']} 个有效交易日中有 {signal_compare['different']} 日不同；详见 signal_comparison.csv。")
    metadata = {"parameters": asdict(Parameters()), "execution_lag": args.execution_lag, "switch_cost_bps": args.switch_cost_bps,
                "signal_source": args.signal, "requested_start": args.start, "requested_end": args.end,
                "sma_comparison": {**ma_metadata, "window": 200, "band": 0.04, "confirmation_days": 1},
                "results": results, "assumptions": assumptions, "signal_comparison": signal_compare}
    metadata["last_indicator_date"] = str(full_signal.index[-1].date())
    metadata["last_indicators"] = {key: float(full_signal.iloc[-1][key]) for key in ("vol20", "vol250", "shock", "index_drawdown", "signal")}
    if (data / "manifest.json").exists():
        metadata["data_manifest"] = json.loads((data / "manifest.json").read_text())
    (output / "summary.json").write_text(json.dumps(metadata, indent=2, ensure_ascii=False, allow_nan=False))
    write_report(output, results, assumptions, annual, {"equity": equity, "drawdown": dd}, sensitivity,
                 sma_basis=ma_metadata["display_basis"], sma_model_note=ma_metadata["model_note"])
    if args.synthetic:
        synthetic_proxy(ndx, rate, prices["TQQQ"], last, args, output)
    for name, m in results.items():
        print(f"{name:20s} CAGR {m['cagr']:7.2%} | max DD {m['max_drawdown']:7.2%} | growth {m['growth_of_1']:.2f} | switches {m['switches']}")
    print(f"Report: {output.resolve() / 'report.html'}")


def synthetic_proxy(ndx, rate, actual, last, args, output):
    """Explicitly approximate extension; never mix its metrics with actual funds."""
    ndx = ndx.loc[:last]
    sf = signals(ndx)
    rf = rate.reindex(rate.index.union(ndx.index)).sort_index().ffill().reindex(ndx.index).shift(1) / 100 / 252
    synthetic = 3 * ndx.pct_change(fill_method=None) - (2 * (rf * 252 + 0.0045) + 0.0095) / 252
    real = actual.pct_change(fill_method=None).dropna()
    synthetic.loc[real.index.intersection(ndx.index)] = real.reindex(real.index.intersection(ndx.index))
    if (synthetic.dropna() <= -1).any():
        raise ValueError("Synthetic fund would be wiped out; cannot continue compounding")
    # Wait for indicators and execution delay; first close is only a valuation.
    start = sf.index[sf.valid][args.execution_lag]
    ix = ndx.loc[start:last].index
    target = aligned(sf.signal.shift(args.execution_lag), ix, "synthetic signal")
    s = portfolio(synthetic.loc[ix], rf.loc[ix], target, args.switch_cost_bps)
    b = portfolio(synthetic.loc[ix], rf.loc[ix], pd.Series(1, index=ix), args.switch_cost_bps)
    s.to_csv(output / "synthetic_proxy_strategy_daily.csv", index_label="date")
    b.to_csv(output / "synthetic_proxy_buyhold_daily.csv", index_label="date")
    note = {"warning": "1986 起 NDX 价格收益代理，2010-02-12 起真实 TQQQ；早期不含指数分红。不是作者 QQQ 总收益重构，不是可交易历史，不包括历史 TLT。",
            "strategy": metrics(s, rf.loc[ix]), "buy_hold": metrics(b, rf.loc[ix])}
    (output / "synthetic_proxy_summary.json").write_text(json.dumps(note, indent=2, ensure_ascii=False, allow_nan=False))
    print("Separate synthetic price-return proxy saved (NOT a replication of the paper's 1985 series).")


if __name__ == "__main__":
    main()
