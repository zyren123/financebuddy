"""Drift, band rebalancing and cost checks for fractional TQQQ weights."""
import unittest

import numpy as np
import pandas as pd

from backtest import metrics, portfolio
from weights import weighted_portfolio


class WeightedPortfolioTests(unittest.TestCase):
    def test_binary_targets_reproduce_existing_portfolio_exactly(self):
        rng = np.random.default_rng(7)
        ix = pd.bdate_range("2001-01-02", periods=900)
        risk = pd.Series(rng.normal(.001, .04, len(ix)), index=ix)
        cash = pd.Series(rng.uniform(0, .0002, len(ix)), index=ix)
        target = pd.Series(rng.random(len(ix)) < .5, index=ix).astype(int).rolling(5).max().fillna(0)
        old, new = portfolio(risk, cash, target, 2.5), weighted_portfolio(risk, cash, target.astype(float), 0.0, 2.5)
        for column in ("net_return", "equity", "drawdown", "position_close", "position_earning", "switch", "cost_fraction"):
            np.testing.assert_array_equal(old[column].to_numpy(float), new[column].to_numpy(float), err_msg=column)
        self.assertEqual(metrics(old, cash), metrics(new, cash))

    def test_drift_rebalances_only_beyond_band(self):
        ix = pd.bdate_range("2024-01-02", periods=4)
        # 50% weight drifts to 0.55/1.05=0.5238 (inside 0.05), then to 0.6111 (outside).
        risk = pd.Series([0, .10, .20, 0], index=ix)
        p = weighted_portfolio(risk, pd.Series(0., index=ix), pd.Series(.5, index=ix), band=0.05, switch_cost_bps=0)
        self.assertEqual(p.switch.tolist(), [True, False, True, False])
        self.assertAlmostEqual(p.position_close.iloc[1], .55 / 1.05)
        self.assertAlmostEqual(p.turnover.iloc[2], .55 / 1.05 * 1.2 / (1 + .2 * .55 / 1.05) - .5)
        self.assertEqual(p.position_close.iloc[2], .5)
        np.testing.assert_allclose(p.gross_return, [0, .05, .2 * .55 / 1.05, 0])
        # 0.25 drifts to exactly 0.75/1.5 = 0.5: on the band edge, not beyond it.
        edge = weighted_portfolio(pd.Series([0, 2.], index=ix[:2]), pd.Series(0., index=ix[:2]), pd.Series(.25, index=ix[:2]), band=.25)
        self.assertEqual(edge.switch.tolist(), [True, False])
        self.assertEqual(edge.position_close.iloc[1], .5)

    def test_exposure_flip_trades_even_inside_band(self):
        ix = pd.bdate_range("2024-01-02", periods=3)
        p = weighted_portfolio(pd.Series(0., index=ix), pd.Series(0., index=ix), pd.Series([0, .05, 0], index=ix), band=.10)
        self.assertEqual(p.switch.tolist(), [True, True, True])

    def test_cost_is_charged_on_absolute_weight_change(self):
        ix = pd.bdate_range("2024-01-02", periods=3)
        flat = pd.Series(0., index=ix)
        p = weighted_portfolio(flat, flat, pd.Series([.25, .75, .5], index=ix), band=0.0, switch_cost_bps=10)
        np.testing.assert_allclose(p.turnover, [1.0, .5, .25])
        np.testing.assert_allclose(p.cost_fraction, [.001, .0005, .00025])
        self.assertAlmostEqual(p.equity.iloc[-1], (1 - .001) * (1 - .0005) * (1 - .00025))
        self.assertAlmostEqual(metrics(p, flat)["risk_exposure"], (.25 + .75) / 2)


if __name__ == "__main__":
    unittest.main()
