"""RUN 03: fixed TQQQ mixes against the three-gate grid, and the three gates moved onto the S&P 500."""
from dataclasses import replace
from itertools import product

import pandas as pd

from backtest import Parameters, metrics, portfolio, signals
from market_data import read_series
from models import synthetic_leverage
from spysim import load_sma_input
from three_gate_params import GRID
from weights import weighted_portfolio

FIXED_WEIGHTS = (0.3, 0.4, 0.5, 0.6)
FIXED_BAND = 0.10


def segments(index, start="1986-10-01", split="2010-02-11"):
    start, split = pd.Timestamp(start), pd.Timestamp(split)
    return {"pre2010": index[(index >= start) & (index < split)], "post2010": index[index >= split], "full": index[index >= start]}


def window_metrics(frame, cash, ix, zero_exposure=False):
    m = metrics(frame, cash.loc[ix])
    return {"cagr": m["cagr"], "maxDrawdown": m["max_drawdown"], "sharpe": m["sharpe"],
            "exposure": 0.0 if zero_exposure else m["risk_exposure"], "switchesPerYear": m["switches_per_year"]}


def matched(history, data_dir, lag=1, cost=2.5):
    windows = segments(history.index)
    cash = history.cash_return

    def run(risk, target, ix, **kw):
        return window_metrics(portfolio(risk.loc[ix], cash.loc[ix], target.loc[ix].astype(int), cost), cash, ix, **kw)

    def gate_target(close, params):
        return signals(close, params).signal.shift(lag).fillna(0).reindex(history.index)

    fixed = [{"weight": w, "segments": {name: window_metrics(
        weighted_portfolio(history.tqqq_return.loc[ix], cash.loc[ix], pd.Series(w, index=ix), FIXED_BAND, cost), cash, ix)
        for name, ix in windows.items()}} for w in FIXED_WEIGHTS]

    grid_points = [replace(Parameters(), **dict(zip(GRID, values))) for values in product(*GRID.values())]
    ndx_grid = [{name: run(history.tqqq_return, gate_target(history.ndx_close, p), ix) for name, ix in windows.items()} for p in grid_points]
    grid_median = {name: {k: float(pd.Series([g[name][k] for g in ndx_grid]).median()) for k in ndx_grid[0][name]} for name in windows}

    # Signal on the S&P price index (no dividends), trade 3x SPYSIM total return financed at the prior T-bill yield.
    spx = read_series(data_dir / "SP500.csv").loc[:history.index[-1]]
    spysim, _, _ = load_sma_input(data_dir, history.index[-1])
    one_x = spysim.pct_change(fill_method=None).reindex(history.index)
    three_x = synthetic_leverage(one_x, history.bill_yield_prior)
    one = pd.Series(1, index=history.index)
    author = {name: run(three_x, gate_target(spx, Parameters()), ix) for name, ix in windows.items()}
    hold3 = {name: run(three_x, one, ix) for name, ix in windows.items()}
    hold1 = {name: run(one_x, one, ix, zero_exposure=True) for name, ix in windows.items()}
    sp_grid = [{name: run(three_x, gate_target(spx, p), ix) for name, ix in windows.items()} for p in grid_points]
    sp_summary = {}
    for name in windows:
        col = lambda k: pd.Series([g[name][k] for g in sp_grid])
        sp_summary[name] = {"cagrMedian": float(col("cagr").median()), "drawdownMedian": float(col("maxDrawdown").median()),
                            "drawdownWorst": float(col("maxDrawdown").min()), "sharpeMedian": float(col("sharpe").median()),
                            "shareSharpeAbove1x": float((col("sharpe") > hold1[name]["sharpe"]).mean())}
    return {"fixedMix": fixed, "gridMedian": grid_median,
            "sp500": {"authorParams": author, "grid": sp_summary, "hold3x": hold3, "hold1x": hold1}}
