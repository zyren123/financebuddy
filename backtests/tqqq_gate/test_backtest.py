"""Behavior checks for state, execution, costs and look-ahead."""
import unittest

import numpy as np
import pandas as pd

from backtest import aligned, confirm, drawdown_gate, portfolio, signals, sma_band_signals


class BacktestTests(unittest.TestCase):
    def test_two_days_confirm_entry_and_exit(self):
        verdict = pd.Series([0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1])
        ready = pd.Series(True, index=verdict.index)
        self.assertEqual(confirm(verdict, ready).tolist(), [0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 1])

    def test_drawdown_hysteresis_and_strict_boundaries(self):
        dd = pd.Series([-0.20, -0.201, -0.15, -0.10, -0.099, -0.20])
        self.assertEqual(drawdown_gate(dd, pd.Series(True, index=dd.index)).tolist(), [True, False, False, False, True, True])

    def test_warmup_does_not_count_toward_confirmation(self):
        verdict = pd.Series([1, 1, 1, 1])
        self.assertEqual(confirm(verdict, pd.Series([False, False, True, True])).tolist(), [0, 0, 0, 1])

    def test_next_close_trade_earns_only_following_session_return(self):
        index = pd.bdate_range("2024-01-02", periods=5)
        signal = pd.Series([0, 1, 1, 0, 0], index=index)
        risk = pd.Series([0, 0.50, 0.40, 0.10, -0.20], index=index)
        cash = pd.Series(0.0, index=index)
        p = portfolio(risk, cash, signal.shift(1).fillna(0), 0)
        self.assertEqual(p.position_close.tolist(), [0, 0, 1, 1, 0])
        self.assertEqual(p.position_earning.tolist(), [0, 0, 0, 1, 1])
        np.testing.assert_allclose(p.net_return, [0, 0, 0, 0.10, -0.20])
        self.assertAlmostEqual(p.equity.iloc[-1], 0.88)

    def test_cost_is_paid_at_trade_close_after_old_holding_return(self):
        ix = pd.bdate_range("2024-01-02", periods=3)
        p = portfolio(pd.Series([0, .1, .2], index=ix), pd.Series(0.0, index=ix), pd.Series([0, 1, 0], index=ix), 2.5)
        self.assertAlmostEqual(p.equity.iloc[-1], 1.2 * (1 - 0.00025) ** 3)
        self.assertEqual(p.switch.tolist(), [True, True, True])

    def test_future_prices_do_not_change_past_signals(self):
        rng = np.random.default_rng(3)
        ix = pd.bdate_range("2000-01-03", periods=650)
        prices = pd.Series(100 * np.cumprod(1 + rng.normal(.0005, .012, len(ix))), index=ix)
        original = signals(prices)
        changed = prices.copy()
        changed.iloc[420:] *= np.linspace(.1, 3, len(ix) - 420)
        pd.testing.assert_frame_equal(original.iloc[:420], signals(changed).iloc[:420])
        pd.testing.assert_frame_equal(original.iloc[:420], signals(prices.iloc[:420]))

    def test_missing_asset_prices_fail_instead_of_silent_forward_fill(self):
        ix = pd.bdate_range("2024-01-02", periods=3)
        with self.assertRaisesRegex(ValueError, "refusing to fill"):
            aligned(pd.Series([1, 2], index=ix[[0, 2]]), ix, "ETF")

    def test_sma_band_enters_exits_and_retains_state_at_boundaries(self):
        # 104 is exactly 104% of the first 2-day average; 120 is exactly 96% of 125.
        prices = pd.Series([96.0, 104.0, 120.0, 130.0, 120.0, 110.0, 110.0, 130.0])
        frame = sma_band_signals(prices, window=2)
        self.assertEqual(frame.signal.tolist(), [0, 0, 1, 1, 1, 0, 0, 1])

    def test_sma_waits_for_200_prices_and_needs_only_one_trigger_close(self):
        prices = pd.Series([100.0] * 199 + [110.0, 100.0])
        frame = sma_band_signals(prices)
        self.assertEqual(frame.signal.iloc[:199].sum(), 0)
        self.assertEqual(frame.signal.iloc[199:].tolist(), [1, 1])
        self.assertAlmostEqual(frame.sma200.iloc[199], 100.05)

    def test_sma_signal_does_not_trade_before_next_close(self):
        ix = pd.bdate_range("2024-01-02", periods=6)
        signal = sma_band_signals(pd.Series([96., 104., 120., 130., 120., 110.], index=ix), window=2).signal
        p = portfolio(pd.Series([0, .5, .4, .3, .1, -.2], index=ix), pd.Series(0., index=ix), signal.shift(1).fillna(0), 0)
        np.testing.assert_allclose(p.net_return, [0, 0, 0, 0, .1, -.2])
        self.assertAlmostEqual(p.equity.iloc[-1], .88)

    def test_sma_future_prices_cannot_change_past_signal(self):
        ix = pd.bdate_range("2000-01-03", periods=650)
        prices = pd.Series(np.linspace(100, 300, len(ix)), index=ix)
        changed = prices.copy()
        changed.iloc[420:] = 10
        pd.testing.assert_frame_equal(sma_band_signals(prices).iloc[:420], sma_band_signals(changed).iloc[:420])


if __name__ == "__main__":
    unittest.main()
