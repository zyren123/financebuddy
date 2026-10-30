"""Pre-registered TQQQ timing rule families: target TQQQ weight at each signal close.

Grids are fixed round numbers chosen before the screen ran; do not tune them on results.
A weight is NaN while its indicator warms up and uses only closes up to that date.
"""
from dataclasses import dataclass
from itertools import product
from typing import Callable

import numpy as np
import pandas as pd

from backtest import signals, sma_band_signals


def three_gate(close):
    frame = signals(close)
    return frame.signal.astype(float).where(frame.valid)


def sma(close, window, band):
    frame = sma_band_signals(close, window, band)
    return frame.signal.astype(float).where(frame.valid)


def dual_ma(close, fast, slow):
    fast_ma, slow_ma = (close.rolling(n, min_periods=n).mean() for n in (fast, slow))
    return (fast_ma > slow_ma).astype(float).where(slow_ma.notna())


def tsmom(close, lookback):
    past = close.shift(lookback)
    return (close > past).astype(float).where(past.notna())


def vol_target(close, window, target, leverage=3):
    sigma = close.pct_change(fill_method=None).rolling(window).std(ddof=1) * np.sqrt(252)
    return (target / (leverage * sigma)).clip(upper=1).where(sigma.notna())


def fixed_mix(close, weight):
    return pd.Series(float(weight), index=close.index)


def trend_vol(close, window, target):
    return sma(close, window, 0.02) * vol_target(close, 20, target)


def grid(**axes):
    return tuple(dict(zip(axes, values)) for values in product(*axes.values()))


@dataclass(frozen=True)
class Family:
    weight_fn: Callable[..., pd.Series]
    grid: tuple[dict, ...]
    rebalance_bands: tuple[float, ...] = (0.0,)
    source: str = "ndx"
    post_hoc: bool = False


@dataclass(frozen=True)
class Candidate:
    family: str
    params: dict
    rebalance_band: float
    label: str


FAMILIES = {
    # Post-hoc: tuned or picked with 2010-2026 already seen. Counted as trials, excluded from the fresh pick.
    "three_gate": Family(three_gate, grid(), post_hoc=True),
    "sma": Family(sma, grid(window=(50, 100, 150, 200, 250), band=(0.0, 0.02, 0.04))),
    "dual_ma": Family(dual_ma, grid(fast=(20, 50), slow=(100, 150, 200))),
    "tsmom": Family(tsmom, grid(lookback=(63, 126, 189, 252))),
    "vol_target": Family(vol_target, grid(window=(20, 60), target=(0.20, 0.30, 0.40, 0.50)), (0.10,)),
    "fixed_mix": Family(fixed_mix, grid(weight=(0.25, 0.50, 0.75)), (0.05, 0.10, 0.20)),
    "trend_vol": Family(trend_vol, grid(window=(150, 200), target=(0.30, 0.50)), (0.10,)),
    "spysim_sma": Family(sma, grid(window=(200,), band=(0.04,)), source="spysim", post_hoc=True),
}


def candidates(families=FAMILIES):
    result = []
    for name, family in families.items():
        for params, band in product(family.grid, family.rebalance_bands):
            terms = [f"{key}={value:g}" for key, value in params.items()] + ([f"rebalance={band:g}"] if band else [])
            result.append(Candidate(name, params, band, f"{name}({','.join(terms)})" if terms else name))
    return result
