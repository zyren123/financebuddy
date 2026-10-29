"""Resamplers keep blocks intact; the identity world reproduces the historical backtest."""
import unittest

import numpy as np
import pandas as pd

from backtest import metrics, portfolio, signals
from bootstrap import permuted_blocks, run_world, stationary_bootstrap


class BootstrapTests(unittest.TestCase):
    def test_permuted_blocks_use_every_day_once_in_contiguous_blocks(self):
        idx = permuted_blocks(103, 10, np.random.default_rng(1))
        self.assertEqual(sorted(idx.tolist()), list(range(103)))
        position = np.argsort(idx)
        for start in range(0, 103, 10):
            where = position[start:min(start + 10, 103)]
            self.assertEqual(where.tolist(), list(range(where[0], where[0] + len(where))))
        self.assertNotEqual(idx.tolist(), list(range(103)))

    def test_stationary_bootstrap_mean_block_length(self):
        idx = stationary_bootstrap(200_000, 20, np.random.default_rng(2))
        breaks = np.count_nonzero(idx[1:] != (idx[:-1] + 1) % 200_000) + 1
        self.assertAlmostEqual(200_000 / breaks, 20, delta=0.6)

    def test_identity_world_matches_direct_backtest(self):
        rng = np.random.default_rng(3)
        index = pd.bdate_range("2000-01-03", periods=700)
        ndx = pd.Series(rng.normal(0.0004, 0.02, len(index)), index=index)
        days = pd.DataFrame({"ndx": ndx, "tqqq": 3 * ndx, "qqq": ndx, "cash": 0.0001}, index=index)
        result = run_world(days, np.arange(len(index)), 252, 1, 2.5)
        close = (1 + ndx).cumprod()
        ix = index[252:]
        direct = portfolio(days.tqqq.loc[ix], days.cash.loc[ix], signals(close).signal.shift(1).fillna(0).loc[ix], 2.5)
        self.assertAlmostEqual(result["three_gate"]["cagr"], metrics(direct, days.cash.loc[ix])["cagr"], places=12)


if __name__ == "__main__":
    unittest.main()
