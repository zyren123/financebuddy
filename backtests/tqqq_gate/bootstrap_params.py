"""Three-gate parameter variants vs SMA200 +4%/-3% on QQQ and SPY bases, in the same parallel worlds."""
import argparse
from dataclasses import replace
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd

from backtest import Parameters, metrics, portfolio, signals, sma_band_signals
from bootstrap import permuted_blocks, stationary_bootstrap
from long_history import build_history
from spysim import load_sma_input
from three_gate_params import SWEEPS

ROOT = Path(__file__).resolve().parent
SCHEMES = {"permute_250": (permuted_blocks, 250), "stationary_63": (stationary_bootstrap, 63), "stationary_250": (stationary_bootstrap, 250)}
SMA = {"sma200_+4/-3_qqq": "qqq", "sma200_+4/-3_spy": "spy"}
START, LAG, COST = 252, 1, 2.5


def gate_variants():
    variants = {"three_gate_default": Parameters()}
    for axis, values in SWEEPS.items():
        for value in values:
            if value != getattr(Parameters(), axis):
                variants[f"three_gate_{axis}={value:g}"] = replace(Parameters(), **{axis: value})
    return variants


VARIANTS = gate_variants()


def evaluate(sample):
    """sample: same-day returns on the original calendar; signals use rebuilt total-return or price paths."""
    ix = sample.index[START:]
    risk, cash = sample.tqqq.loc[ix], sample.cash.loc[ix]
    targets = {name: signals((1 + sample.ndx).cumprod(), p).signal for name, p in VARIANTS.items()}
    for name, column in SMA.items():
        frame = sma_band_signals((1 + sample[column]).cumprod(), 200, 0.04, exit_band=0.03)
        if not frame.valid.iloc[START - LAG]:
            raise ValueError("SMA200 not warmed up before the evaluation start")
        targets[name] = frame.signal
    frames = {name: portfolio(risk, cash, t.shift(LAG).fillna(0).loc[ix], COST) for name, t in targets.items()}
    one = pd.Series(1, index=ix)
    frames |= {"tqqq_hold": portfolio(risk, cash, one, COST), "qqq_hold": portfolio(sample.qqq.loc[ix], cash, one, COST)}
    return {name: metrics(f, cash) for name, f in frames.items()}


def _init(days):
    global DAYS
    DAYS = days


def _world(job):
    scheme, world, seed = job
    n = len(DAYS)
    if scheme == "actual":
        idx = np.arange(n)
    else:
        draw, block = SCHEMES[scheme]
        idx = draw(n, block, np.random.default_rng([seed, list(SCHEMES).index(scheme), world]))
    sample = pd.DataFrame(DAYS.to_numpy()[idx], index=DAYS.index, columns=DAYS.columns)
    return [{"scheme": scheme, "world": world, "rule": rule, "cagr": m["cagr"], "max_drawdown": m["max_drawdown"],
             "sharpe": m["sharpe"], "switches_per_year": m["switches_per_year"]} for rule, m in evaluate(sample).items()]


def summarize(worlds):
    actual = worlds[worlds.scheme == "actual"].set_index("rule")
    rows = []
    for scheme, g in worlds[worlds.scheme != "actual"].groupby("scheme", sort=False):
        w = g.pivot(index="world", columns="rule")
        for rule in w["cagr"].columns:
            c, d, s = w[("cagr", rule)], w[("max_drawdown", rule)], w[("sharpe", rule)]
            rows.append({"scheme": scheme, "rule": rule, "worlds": len(w),
                         "actual_cagr": actual.loc[rule, "cagr"], "actual_mdd": actual.loc[rule, "max_drawdown"],
                         "cagr_p50": c.median(), "cagr_p05": c.quantile(0.05), "mdd_p50": d.median(), "mdd_p05": d.quantile(0.05),
                         "sharpe_p50": s.median(), "p_mdd_worse_70": (d < -0.70).mean(),
                         "actual_mdd_percentile": (d < actual.loc[rule, "max_drawdown"]).mean(),
                         "actual_cagr_percentile": (c < actual.loc[rule, "cagr"]).mean(),
                         "p_sharpe_gt_qqq_hold": (s > w[("sharpe", "qqq_hold")]).mean(),
                         "p_mdd_shallower_than_tqqq_hold": (d > w[("max_drawdown", "tqqq_hold")]).mean(),
                         **{f"p_cagr_gt_{k}": (c > w[("cagr", k)]).mean() for k in SMA},
                         **{f"p_mdd_shallower_than_{k}": (d > w[("max_drawdown", k)]).mean() for k in SMA},
                         "switches_per_year_p50": w[("switches_per_year", rule)].median()})
    return pd.DataFrame(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=ROOT / "data" / "yahoo")
    parser.add_argument("--output", type=Path, default=ROOT / "results" / "bootstrap_params")
    parser.add_argument("--end", default="2026-10-13")
    parser.add_argument("--worlds", type=int, default=500)
    parser.add_argument("--seed", type=int, default=20261030)
    parser.add_argument("--processes", type=int, default=8)
    args = parser.parse_args()
    history, _, _ = build_history(args.data_dir, args.end)
    spy, _, _ = load_sma_input(args.data_dir, history.index[-1])
    # QQQ basis: NDX price returns before QQQ listed, real QQQ adjusted returns after (the 1x underlying already spliced).
    days = pd.DataFrame({"ndx": history.ndx_close.pct_change(fill_method=None), "tqqq": history.tqqq_return,
                         "qqq": history.underlying_return, "spy": spy.pct_change(fill_method=None).reindex(history.index),
                         "cash": history.cash_return}).iloc[1:]
    if days.isna().any().any():
        raise ValueError("Missing same-day returns; refusing to resample a gap")
    jobs = [("actual", 0, args.seed)] + [(s, w, args.seed) for s in SCHEMES for w in range(args.worlds)]
    with Pool(args.processes, initializer=_init, initargs=(days,)) as pool:
        rows = [r for batch in pool.imap(_world, jobs, chunksize=8) for r in batch]
    worlds = pd.DataFrame(rows)
    summary = summarize(worlds)
    args.output.mkdir(parents=True, exist_ok=True)
    worlds.to_csv(args.output / "worlds.csv", index=False)
    summary.to_csv(args.output / "summary.csv", index=False)
    pd.set_option("display.width", 250, "display.max_rows", 200)
    cols = ["actual_cagr", "actual_mdd", "cagr_p50", "cagr_p05", "mdd_p50", "p_mdd_worse_70", "actual_mdd_percentile",
            "p_sharpe_gt_qqq_hold", *[f"p_cagr_gt_{k}" for k in SMA], *[f"p_mdd_shallower_than_{k}" for k in SMA]]
    for scheme, g in summary.groupby("scheme", sort=False):
        print(f"== {scheme}")
        print(g.set_index("rule")[cols].round(3).to_string())


if __name__ == "__main__":
    main()
