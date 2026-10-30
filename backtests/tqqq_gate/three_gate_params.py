"""Three-gate parameter sensitivity on synthetic pre-2010, real post-2010, and the combined window."""
import argparse
from dataclasses import asdict, replace
from itertools import product
from pathlib import Path

import pandas as pd

from backtest import Parameters, metrics, portfolio, signals
from long_history import build_history

ROOT = Path(__file__).resolve().parent
DEFAULT = Parameters()
# One axis at a time around the author's rule; long_window stops at 250 so every variant warms up before the start.
SWEEPS = {
    "vol_limit": (0.25, 0.30, 0.35, 0.40, 0.45),
    "shock_limit": (1.00, 1.05, 1.10, 1.20, 1.30),
    "exit_drawdown": (-0.15, -0.20, -0.25, -0.30),
    "reenter_drawdown": (-0.05, -0.10, -0.15),
    "short_window": (10, 20, 40),
    "long_window": (150, 200, 250),
    "confirmation_days": (1, 2, 3, 5),
}
GRID = {"vol_limit": SWEEPS["vol_limit"], "shock_limit": SWEEPS["shock_limit"], "exit_drawdown": SWEEPS["exit_drawdown"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=ROOT / "data" / "yahoo")
    parser.add_argument("--output", type=Path, default=ROOT / "results" / "three_gate_params")
    parser.add_argument("--start", default="1986-10-01")
    parser.add_argument("--split", default="2010-02-11")
    parser.add_argument("--end", default="2026-10-13")
    parser.add_argument("--execution-lag", type=int, choices=(0, 1, 2), default=1)
    parser.add_argument("--switch-cost-bps", type=float, default=2.5)
    args = parser.parse_args()
    history, _, _ = build_history(args.data_dir, args.end)
    index = history.index
    split = pd.Timestamp(args.split)
    windows = {"pre2010": index[(index >= pd.Timestamp(args.start)) & (index < split)],
               "post2010": index[index >= split], "full": index[index >= pd.Timestamp(args.start)]}
    if not history.tqqq_source.loc[windows["post2010"][1:]].eq("actual").all():
        raise ValueError("post-2010 window must use only real TQQQ returns")

    def evaluate(target, risk=history.tqqq_return):
        row = {}
        for name, ix in windows.items():
            m = metrics(portfolio(risk.loc[ix], history.cash_return.loc[ix], target.loc[ix], args.switch_cost_bps), history.cash_return.loc[ix])
            row |= {f"{name}_cagr": m["cagr"], f"{name}_mdd": m["max_drawdown"], f"{name}_sharpe": m["sharpe"],
                    f"{name}_exposure": m["risk_exposure"], f"{name}_switches_per_year": m["switches_per_year"]}
        return row

    def run(params):
        frame = signals(history.ndx_close, params)
        first = frame.index[frame.valid][0]
        if first >= windows["full"][0]:
            raise ValueError(f"{params}: indicators not ready before {windows['full'][0].date()}")
        return evaluate(frame.signal.shift(args.execution_lag).fillna(0).astype(int))

    one = pd.Series(1, index=index)
    baselines = pd.DataFrame([{"rule": "TQQQ buy & hold", **evaluate(one)},
                              {"rule": "QQQ / index buy & hold", **evaluate(one, history.underlying_return)}])
    sweep = []
    for axis, values in SWEEPS.items():
        for value in values:
            params = replace(DEFAULT, **{axis: value})
            sweep.append({"axis": axis, "value": value, "is_default": value == getattr(DEFAULT, axis), **run(params)})
    sweep = pd.DataFrame(sweep)
    grid = pd.DataFrame([{**dict(zip(GRID, values)), **run(replace(DEFAULT, **dict(zip(GRID, values))))}
                         for values in product(*GRID.values())])
    tqqq = baselines.iloc[0]
    summary = {}
    for name in windows:
        summary[name] = {
            "median_cagr": grid[f"{name}_cagr"].median(), "min_cagr": grid[f"{name}_cagr"].min(), "max_cagr": grid[f"{name}_cagr"].max(),
            "median_mdd": grid[f"{name}_mdd"].median(), "worst_mdd": grid[f"{name}_mdd"].min(), "best_mdd": grid[f"{name}_mdd"].max(),
            "median_sharpe": grid[f"{name}_sharpe"].median(),
            "share_cagr_above_tqqq_hold": (grid[f"{name}_cagr"] > tqqq[f"{name}_cagr"]).mean(),
            "share_sharpe_above_tqqq_hold": (grid[f"{name}_sharpe"] > tqqq[f"{name}_sharpe"]).mean(),
            "share_mdd_shallower_than_tqqq_hold": (grid[f"{name}_mdd"] > tqqq[f"{name}_mdd"]).mean(),
        }
    summary = pd.DataFrame(summary)
    default_rank = {name: int(grid[f"{name}_sharpe"].rank(ascending=False)[
        (grid.vol_limit == DEFAULT.vol_limit) & (grid.shock_limit == DEFAULT.shock_limit) & (grid.exit_drawdown == DEFAULT.exit_drawdown)].iloc[0])
        for name in windows}
    rank_corr = {metric: float(grid[f"pre2010_{metric}"].rank().corr(grid[f"post2010_{metric}"].rank())) for metric in ("cagr", "sharpe", "mdd")}
    output = args.output
    output.mkdir(parents=True, exist_ok=True)
    baselines.to_csv(output / "baselines.csv", index=False)
    sweep.to_csv(output / "one_at_a_time.csv", index=False)
    grid.to_csv(output / "grid.csv", index=False)
    summary.to_csv(output / "grid_summary.csv", index_label="statistic")
    pd.Series({**{f"default_sharpe_rank_{k}": v for k, v in default_rank.items()}, **{f"pre_post_rank_corr_{k}": v for k, v in rank_corr.items()},
               "grid_size": len(grid), "defaults": str(asdict(DEFAULT))}).to_csv(output / "grid_facts.csv", header=["value"])
    pd.set_option("display.width", 220)
    pct = lambda frame: frame.apply(lambda c: (c * 100).round(1) if c.name.endswith(("cagr", "mdd")) else c.round(2) if c.dtype.kind == "f" else c)
    cols = [f"{w}_{m}" for w in windows for m in ("cagr", "mdd", "sharpe")]
    print(pct(baselines.set_index("rule")[cols]).to_string())
    print(pct(sweep.set_index(["axis", "value"])[cols]).to_string())
    print(summary.round(3).to_string())
    print("default Sharpe rank in grid:", default_rank, "| pre/post rank corr:", {k: round(v, 3) for k, v in rank_corr.items()}, "| grid", len(grid))


if __name__ == "__main__":
    main()
