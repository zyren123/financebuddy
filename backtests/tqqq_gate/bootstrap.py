"""Parallel worlds: rebuild NDX, TQQQ and cash paths from reordered historical blocks, then rerun the rules."""
import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from backtest import metrics, portfolio, signals, sma_band_signals
from long_history import build_history
from weights import weighted_portfolio

ROOT = Path(__file__).resolve().parent
RULES = ("three_gate", "ndx_sma200_4pct", "fixed_50pct", "tqqq_hold", "qqq_hold")


def permuted_blocks(n, block, rng):
    """Every day exactly once: cut history into consecutive blocks and reorder the blocks."""
    starts = np.arange(0, n, block)
    return np.concatenate([np.arange(s, min(s + block, n)) for s in starts[rng.permutation(len(starts))]])


def stationary_bootstrap(n, mean_block, rng):
    """Politis & Romano (1994): random starts, geometric block lengths, circular; days may repeat or be absent."""
    restart, starts = rng.random(n) < 1 / mean_block, rng.integers(n, size=n)
    idx = np.empty(n, dtype=int)
    idx[0] = starts[0]
    for t in range(1, n):
        idx[t] = starts[t] if restart[t] else (idx[t - 1] + 1) % n
    return idx


def run_world(days, idx, start, lag, cost):
    """days: one row per historical session of same-day returns; idx reorders them onto the original calendar."""
    sample = pd.DataFrame(days.to_numpy()[idx], index=days.index, columns=days.columns)
    ndx = (1 + sample.ndx).cumprod()
    ix = sample.index[start:]
    risk, qqq, cash = sample.tqqq.loc[ix], sample.qqq.loc[ix], sample.cash.loc[ix]
    gate, trend = signals(ndx), sma_band_signals(ndx, 200, 0.04)
    if not (gate.valid.iloc[start - lag] and trend.valid.iloc[start - lag]):
        raise ValueError("Indicators not warmed up before the evaluation start")
    one = pd.Series(1, index=ix)
    frames = {"three_gate": portfolio(risk, cash, gate.signal.shift(lag).fillna(0).loc[ix], cost),
              "ndx_sma200_4pct": portfolio(risk, cash, trend.signal.shift(lag).fillna(0).loc[ix], cost),
              "fixed_50pct": weighted_portfolio(risk, cash, one * 0.5, 0.10, cost),
              "tqqq_hold": portfolio(risk, cash, one, cost), "qqq_hold": portfolio(qqq, cash, one, cost)}
    return {rule: metrics(frame, cash) for rule, frame in frames.items()}


def summarize(worlds):
    rows = []
    for (method, block), g in worlds.groupby(["method", "block"], sort=False):
        w = g.pivot(index="world", columns="rule")
        gate = lambda col: w[(col, "three_gate")]
        row = {"method": method, "block": block, "worlds": len(w)}
        for rule in RULES:
            row |= {f"{rule}_cagr_p50": w[("cagr", rule)].median(), f"{rule}_mdd_p50": w[("max_drawdown", rule)].median(),
                    f"{rule}_sharpe_p50": w[("sharpe", rule)].median()}
        row |= {"gate_cagr_p05": gate("cagr").quantile(0.05), "gate_cagr_p95": gate("cagr").quantile(0.95),
                "gate_mdd_p05": gate("max_drawdown").quantile(0.05),
                "p_gate_cagr_gt_tqqq": (gate("cagr") > w[("cagr", "tqqq_hold")]).mean(),
                "p_gate_cagr_gt_qqq": (gate("cagr") > w[("cagr", "qqq_hold")]).mean(),
                "p_gate_cagr_gt_fixed50": (gate("cagr") > w[("cagr", "fixed_50pct")]).mean(),
                "p_gate_sharpe_gt_qqq": (gate("sharpe") > w[("sharpe", "qqq_hold")]).mean(),
                "p_gate_sharpe_gt_fixed50": (gate("sharpe") > w[("sharpe", "fixed_50pct")]).mean(),
                "p_gate_mdd_shallower_than_tqqq": (gate("max_drawdown") > w[("max_drawdown", "tqqq_hold")]).mean(),
                "p_gate_mdd_worse_than_70pct": (gate("max_drawdown") < -0.70).mean(),
                "p_gate_cagr_gt_sma200": (gate("cagr") > w[("cagr", "ndx_sma200_4pct")]).mean()}
        rows.append(row)
    return pd.DataFrame(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=ROOT / "data" / "yahoo")
    parser.add_argument("--output", type=Path, default=ROOT / "results" / "bootstrap")
    parser.add_argument("--end", default="2026-10-13")
    parser.add_argument("--worlds", type=int, default=500)
    parser.add_argument("--blocks", type=int, nargs="+", default=[1, 21, 63, 250])
    parser.add_argument("--methods", nargs="+", choices=("permute", "stationary"), default=["permute", "stationary"])
    parser.add_argument("--seed", type=int, default=20261029)
    parser.add_argument("--execution-lag", type=int, choices=(0, 1, 2), default=1)
    parser.add_argument("--switch-cost-bps", type=float, default=2.5)
    args = parser.parse_args()
    history, _, _ = build_history(args.data_dir, args.end)
    days = pd.DataFrame({"ndx": history.ndx_close.pct_change(fill_method=None), "tqqq": history.tqqq_return,
                         "qqq": history.underlying_return, "cash": history.cash_return}).iloc[1:]
    if days.isna().any().any():
        raise ValueError("Missing same-day returns; refusing to resample a gap")
    start = 251 + args.execution_lag
    rows = [{"method": "actual", "block": 0, "world": 0, "rule": rule, **m}
            for rule, m in run_world(days, np.arange(len(days)), start, args.execution_lag, args.switch_cost_bps).items()]
    rng = np.random.default_rng(args.seed)
    draw = {"permute": permuted_blocks, "stationary": stationary_bootstrap}
    for method in args.methods:
        for block in args.blocks:
            for world in range(args.worlds):
                idx = draw[method](len(days), block, rng)
                for rule, m in run_world(days, idx, start, args.execution_lag, args.switch_cost_bps).items():
                    rows.append({"method": method, "block": block, "world": world, "rule": rule, **m})
            print(f"{method} block {block}: {args.worlds} worlds done", flush=True)
    worlds = pd.DataFrame(rows)
    summary = summarize(worlds[worlds.method != "actual"])
    args.output.mkdir(parents=True, exist_ok=True)
    worlds.to_csv(args.output / "worlds.csv", index=False)
    summary.to_csv(args.output / "summary.csv", index=False)
    actual = worlds[worlds.method == "actual"].set_index("rule")[["start", "end", "cagr", "max_drawdown", "sharpe"]]
    actual.to_csv(args.output / "actual.csv")
    pd.set_option("display.width", 250)
    print(actual.to_string())
    print(summary.set_index(["method", "block"]).T.round(3).to_string())


if __name__ == "__main__":
    main()
