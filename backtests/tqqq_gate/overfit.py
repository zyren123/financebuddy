"""Multiple-testing checks: Deflated Sharpe ratio and CSCV probability of backtest overfitting."""
from itertools import combinations
from math import e, sqrt
from statistics import NormalDist

import numpy as np
import pandas as pd

EULER_GAMMA = 0.5772156649015329
NORMAL = NormalDist()


def expected_max_sharpe(n_trials, variance):
    """Bailey & López de Prado (2014): expected best Sharpe of n_trials skill-less trials."""
    if n_trials == 1:
        return 0.0
    return sqrt(variance) * ((1 - EULER_GAMMA) * NORMAL.inv_cdf(1 - 1 / n_trials)
                             + EULER_GAMMA * NORMAL.inv_cdf(1 - 1 / (n_trials * e)))


def deflated_sharpe(returns, n_trials, trial_sharpes_var):
    """Per-period Sharpe and moments; kurtosis is non-excess. n_trials=1 is PSR against zero."""
    r = returns.dropna()
    sr = r.mean() / r.std(ddof=1)
    skew, kurt = r.skew(), r.kurt() + 3
    sr0 = expected_max_sharpe(n_trials, trial_sharpes_var)
    z = (sr - sr0) * sqrt(len(r) - 1) / sqrt(1 - skew * sr + (kurt - 1) / 4 * sr ** 2)
    return {"dsr": NORMAL.cdf(z), "sharpe_daily": float(sr), "sharpe_annual": float(sr * sqrt(252)),
            "expected_max_sharpe_daily": sr0, "expected_max_sharpe_annual": sr0 * sqrt(252),
            "n_trials": n_trials, "trial_sharpe_variance_daily": float(trial_sharpes_var),
            "skew": float(skew), "kurtosis": float(kurt), "observations": len(r)}


def pbo_cscv(returns, blocks=16):
    """Bailey et al. (2017) CSCV over every half/half split of contiguous blocks."""
    if blocks < 2 or blocks % 2:
        raise ValueError("blocks must be an even number >= 2")
    x = returns.to_numpy(float)
    if np.isnan(x).any():
        raise ValueError("CSCV needs a complete returns matrix")
    size = len(x) // blocks
    dropped = len(x) - size * blocks
    x = x[dropped:].reshape(blocks, size, x.shape[1])
    sums, squares = x.sum(axis=1), (x ** 2).sum(axis=1)
    splits = np.array(list(combinations(range(blocks), blocks // 2)))
    member = np.zeros((len(splits), blocks))
    member[np.arange(len(splits))[:, None], splits] = 1

    def sharpe(mask):
        count = mask.sum(axis=1, keepdims=True) * size
        mean = mask @ sums / count
        return mean / np.sqrt((mask @ squares - count * mean ** 2) / (count - 1))

    in_sample, out_sample = sharpe(member), sharpe(1 - member)
    rows = np.arange(len(splits))
    best = in_sample.argmax(axis=1)
    rank = pd.DataFrame(out_sample).rank(axis=1).to_numpy()[rows, best]
    omega = rank / (x.shape[2] + 1)
    logit = np.log(omega / (1 - omega))
    winner_oos = out_sample[rows, best]
    return {"pbo": float((logit <= 0).mean()), "n_splits": len(splits), "blocks": blocks, "block_sessions": size,
            "dropped_leading_sessions": dropped, "median_logit": float(np.median(logit)),
            "share_winner_oos_below_median": float((winner_oos < np.median(out_sample, axis=1)).mean())}
