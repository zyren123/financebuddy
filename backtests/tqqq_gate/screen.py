"""Pre-registered screen of TQQQ timing rule families: synthetic in-sample, real-ETF holdout."""
import argparse
import json
from pathlib import Path

import pandas as pd

from backtest import metrics
from long_history import build_history
from overfit import deflated_sharpe, pbo_cscv
from rules import FAMILIES, candidates
from spysim import load_sma_input
from weights import weighted_portfolio

ROOT = Path(__file__).resolve().parent
WINDOW_NAMES = {"is": "样本内（合成 TQQQ）", "oos": "样本外（真实 TQQQ）", "full": "全区间"}


def raw_weights(cands, closes, index):
    """Target weight per candidate on the NDX calendar; NaN only before its own warm-up ends."""
    table = {}
    for c in cands:
        family = FAMILIES[c.family]
        weight = family.weight_fn(closes[family.source], **c.params).reindex(index)
        first = weight.first_valid_index()
        if first is None or weight.loc[first:].isna().any():
            raise ValueError(f"{c.label}: indicator missing on screen dates after warm-up; refusing to fill")
        table[c.label] = weight
    return pd.DataFrame(table)


def summarize(frame, rf):
    m = metrics(frame, rf)
    years = (frame.index[-1] - frame.index[0]).days / 365.25
    m["calmar"] = m["cagr"] / -m["max_drawdown"] if m["max_drawdown"] < 0 else None
    m["turnover_per_year"] = float(frame.turnover.iloc[1:].sum() / years)
    return m


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=ROOT / "data" / "yahoo")
    parser.add_argument("--output", type=Path, default=ROOT / "results" / "rule_screen")
    parser.add_argument("--end", default="2026-10-13")
    parser.add_argument("--split", default="2010-02-11", help="First out-of-sample valuation close; later returns must be real TQQQ")
    parser.add_argument("--execution-lag", type=int, choices=(0, 1, 2), default=1)
    parser.add_argument("--switch-cost-bps", type=float, default=2.5, help="Cost per unit of traded TQQQ weight")
    parser.add_argument("--cscv-blocks", type=int, default=16)
    args = parser.parse_args()
    if not 0 <= args.switch_cost_bps < 10000:
        parser.error("Cost must be between 0 and 10000 bps")
    history, _, _ = build_history(args.data_dir, args.end)
    index = history.index
    spysim_close, _, spysim_meta = load_sma_input(args.data_dir, index[-1])
    cands = candidates()
    weights = raw_weights(cands, {"ndx": history.ndx_close, "spysim": spysim_close}, index)
    valid_from = weights.apply(pd.Series.first_valid_index)
    start = index[index.get_loc(valid_from.max()) + args.execution_lag]
    split = pd.Timestamp(args.split)
    windows = {"is": index[(index >= start) & (index < split)], "oos": index[index >= split], "full": index[index >= start]}
    if min(len(w) for w in windows.values()) < 3:
        raise ValueError("A screen window is too short")
    if not history.tqqq_source.loc[windows["oos"][1:]].eq("actual").all():
        raise ValueError("Out-of-sample returns must all be real TQQQ; move --split to or after the first real TQQQ close")
    cash = history.cash_return

    def lagged(table, lag):
        return table.fillna(0.0).shift(lag).fillna(0.0)

    targets = lagged(weights, args.execution_lag)
    strategies = [(c.label, c.family, True, history.tqqq_return, targets[c.label], c.rebalance_band) for c in cands]
    one = pd.Series(1.0, index=index)
    strategies += [("TQQQ buy & hold", "baseline", False, history.tqqq_return, one, 0.0),
                   ("Index / QQQ buy & hold", "baseline", False, history.underlying_return, one, 0.0)]
    rows, excess = [], {}
    for label, family, trial, risk, target, band in strategies:
        for window, ix in windows.items():
            frame = weighted_portfolio(risk.loc[ix], cash.loc[ix], target.loc[ix], band, args.switch_cost_bps)
            rows.append({"label": label, "family": family, "trial": trial, "window": window,
                         "risk_asset": "1x index/QQQ" if family == "baseline" and label.startswith("Index") else "TQQQ",
                         "rebalance_band": band, **summarize(frame, cash.loc[ix])})
            excess[label, window] = frame.net_return.iloc[1:] - cash.loc[ix[1:]]
    table = pd.DataFrame(rows)
    sharpe = table.pivot(index="label", columns="window", values="sharpe")
    trials = [c.label for c in cands]
    is_sharpe = sharpe.loc[trials, "is"]
    family_of = {c.label: c.family for c in cands}
    family_winners = {name: is_sharpe[[l for l in trials if family_of[l] == name]].idxmax() for name in FAMILIES}
    overall = is_sharpe.idxmax()
    fresh_trials = [l for l in trials if not FAMILIES[family_of[l]].post_hoc]
    fresh = is_sharpe[fresh_trials].idxmax()
    spearman = float(is_sharpe.rank().corr(sharpe.loc[trials, "oos"].rank()))
    oos_rank = sharpe.loc[trials, "oos"].rank(ascending=False).astype(int)
    daily_var = float((is_sharpe / 252 ** 0.5).var(ddof=1))

    def selected(label):
        return {"label": label, "oos_sharpe_rank": f"{oos_rank[label]} of {len(trials)}",
                "dsr_in_sample": deflated_sharpe(excess[label, "is"], len(trials), daily_var),
                "psr_out_of_sample_single_trial": deflated_sharpe(excess[label, "oos"], 1, 0.0)}
    pbo = pbo_cscv(pd.DataFrame({l: excess[l, "full"] for l in trials}), args.cscv_blocks)
    # three_gate's parameters were tuned on this whole window, which biases every CSCV half toward it.
    pbo_fresh = pbo_cscv(pd.DataFrame({l: excess[l, "full"] for l in fresh_trials}), args.cscv_blocks)

    roles = {label: [f"{name} 族样本内最优" for name, w in family_winners.items() if w == label] for label in table.label.unique()}
    roles[fresh].insert(0, "不含事后规则的样本内最优")
    roles[overall].insert(0, "全体样本内最优")
    for label in ("TQQQ buy & hold", "Index / QQQ buy & hold"):
        roles[label] = ["基准"]
    finalists = table[table.label.map(lambda l: bool(roles[l]))].copy()
    finalists.insert(1, "selected_as", finalists.label.map(lambda l: "；".join(roles[l])))

    sensitivity = []
    oos = windows["oos"]
    winners = list(dict.fromkeys(family_winners.values()))
    by_label = {c.label: c for c in cands}
    for lag in (0, 1, 2):
        shifted = lagged(weights[winners], lag)
        for cost in (0.0, 2.5, 10.0):
            for label in winners:
                frame = weighted_portfolio(history.tqqq_return.loc[oos], cash.loc[oos], shifted[label].loc[oos],
                                           by_label[label].rebalance_band, cost)
                sensitivity.append({"label": label, "family": family_of[label], "execution_lag": lag,
                                    "switch_cost_bps": cost, **summarize(frame, cash.loc[oos])})
    sensitivity = pd.DataFrame(sensitivity)

    window_info = {w: {"start": str(ix[0].date()), "end": str(ix[-1].date()), "sessions": len(ix),
                       "tqqq_return_sources": history.tqqq_source.loc[ix[1:]].value_counts().to_dict()} for w, ix in windows.items()}
    overfit = {
        "n_trials": len(trials), "trials_per_family": {n: sum(f == n for f in family_of.values()) for n in FAMILIES},
        "execution_lag": args.execution_lag, "switch_cost_bps": args.switch_cost_bps, "windows": window_info,
        "common_start_reason": f"latest indicator warm-up ends {valid_from.max().date()} ({valid_from.idxmax()}), plus execution lag",
        "selection_metric": "in-sample annualized Sharpe of daily net return over T-bill proxy",
        "post_hoc_families": [n for n, f in FAMILIES.items() if f.post_hoc], "family_is_winners": family_winners,
        "overall_is_winner": selected(overall), "fresh_is_winner_excluding_post_hoc": selected(fresh),
        # The author disclosed ~6,000 indicators and 1,944 grid points; V is still this screen's.
        "overall_is_winner_dsr_by_assumed_trials": {n: deflated_sharpe(excess[overall, "is"], n, daily_var)["dsr"] for n in (48, 1944, 6000)},
        "is_oos_sharpe_spearman": spearman,
        "pbo_cscv_full_window": pbo, "pbo_cscv_full_window_excluding_post_hoc": {"n_trials": len(fresh_trials), **pbo_fresh},
        "spysim_signal": spysim_meta["display_basis"],
    }
    output = args.output
    output.mkdir(parents=True, exist_ok=True)
    table.to_csv(output / "candidates.csv", index=False)
    finalists.to_csv(output / "finalists.csv", index=False)
    sensitivity.to_csv(output / "sensitivity.csv", index=False)
    (output / "overfit.json").write_text(json.dumps(overfit, indent=2, ensure_ascii=False, allow_nan=False))
    wide = finalists.pivot(index="label", columns="window")
    order = list(dict.fromkeys([overall, fresh, *family_winners.values(), "TQQQ buy & hold", "Index / QQQ buy & hold"]))
    lines = ["# TQQQ 择时规则族预注册筛选", "",
             *[f"- {WINDOW_NAMES[w]}：{i['start']} — {i['end']}，{i['sessions']:,} 个收盘；TQQQ 收益来源 {i['tqqq_return_sources']}" for w, i in window_info.items()],
             f"- {len(trials)} 个试验；信号为 NDX 价格收盘（spysim_sma 为 {spysim_meta['display_basis']}）；延迟 {args.execution_lag} 个收盘成交；每单位换手 {args.switch_cost_bps:g}bp；防守为 T-bill 代理；税前。",
             "- 选择规则：各族及全体按样本内 Sharpe 取最优，事先固定。", "",
             "| 规则 | 入选 | IS 年化 | IS 回撤 | IS Sharpe | OOS 年化 | OOS 回撤 | OOS Sharpe | OOS 平均仓位 | OOS 年换手 |",
             "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for label in order:
        r = wide.loc[label]
        lines.append(f"| `{label}` | {r[('selected_as', 'is')]} | {r[('cagr', 'is')]:.2%} | {r[('max_drawdown', 'is')]:.2%} | {r[('sharpe', 'is')]:.2f} | "
                     f"{r[('cagr', 'oos')]:.2%} | {r[('max_drawdown', 'oos')]:.2%} | {r[('sharpe', 'oos')]:.2f} | {r[('risk_exposure', 'oos')]:.1%} | {r[('turnover_per_year', 'oos')]:.2f} |")
    picks = (("overall_is_winner", "全体样本内最优"), ("fresh_is_winner_excluding_post_hoc", "不含事后规则的样本内最优"))
    lines += ["", f"- 样本内与样本外 Sharpe 的 Spearman 秩相关：{spearman:.3f}。"]
    for key, name in picks:
        pick = overfit[key]
        lines.append(f"- {name} `{pick['label']}`：样本外 Sharpe 排第 {pick['oos_sharpe_rank']}；样本内 DSR（N={len(trials)}）"
                     f"{pick['dsr_in_sample']['dsr']:.3f}；样本外单次 PSR {pick['psr_out_of_sample_single_trial']['dsr']:.3f}。")
    lines += ["- 全体样本内最优按作者披露的搜索规模计 DSR：" + "，".join(f"N={n} 为 {v:.3f}" for n, v in overfit["overall_is_winner_dsr_by_assumed_trials"].items())
              + "（方差沿用本次 48 个试验）。",
              f"- CSCV PBO（全区间，{pbo['blocks']} 块，{pbo['n_splits']:,} 种切分）：{pbo['pbo']:.3f}；中位 logit {pbo['median_logit']:.3f}。"
              f"去掉事后规则后的 {overfit['pbo_cscv_full_window_excluding_post_hoc']['n_trials']} 个试验：{pbo_fresh['pbo']:.3f}；中位 logit {pbo_fresh['median_logit']:.3f}。",
              "", "全部候选、三窗口指标见 candidates.csv；成本/延迟敏感性见 sensitivity.csv；过拟合统计见 overfit.json。"]
    (output / "summary.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"{'rule':44s} {'IS CAGR':>8s} {'IS MDD':>8s} {'IS SR':>6s} {'OOS CAGR':>9s} {'OOS MDD':>8s} {'OOS SR':>6s} {'expo':>6s} {'turn/y':>6s}")
    for label in order:
        r = wide.loc[label]
        print(f"{label:44s} {r[('cagr', 'is')]:8.2%} {r[('max_drawdown', 'is')]:8.2%} {r[('sharpe', 'is')]:6.2f} {r[('cagr', 'oos')]:9.2%} "
              f"{r[('max_drawdown', 'oos')]:8.2%} {r[('sharpe', 'oos')]:6.2f} {r[('risk_exposure', 'oos')]:6.1%} {r[('turnover_per_year', 'oos')]:6.2f}")
    print(f"Spearman IS/OOS {spearman:.3f} | PBO {pbo['pbo']:.3f} | PBO excluding post-hoc {pbo_fresh['pbo']:.3f}")
    for key, _ in picks:
        pick = overfit[key]
        print(f"{key}: {pick['label']} | OOS rank {pick['oos_sharpe_rank']} | DSR IS {pick['dsr_in_sample']['dsr']:.3f} | PSR OOS {pick['psr_out_of_sample_single_trial']['dsr']:.3f}")
    print(f"Outputs: {output.resolve()}")


if __name__ == "__main__":
    main()
