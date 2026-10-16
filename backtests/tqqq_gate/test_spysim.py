from pathlib import Path
import tempfile
import unittest

import numpy as np
import pandas as pd

from spysim import EXPENSE_ADDBACK, load_sma_input, reconstruct_spysim


class SPYSIMTests(unittest.TestCase):
    def test_restores_early_fee_and_uses_actual_spy_total_returns(self):
        ix = pd.bdate_range("1993-01-27", periods=5)
        fee = EXPENSE_ADDBACK / 252
        early = pd.Series(100 * np.cumprod([1, 1 + .01 - fee, 1 - .02 - fee]), index=ix[:3])
        spy = pd.Series([20., 22., 19.8], index=ix[2:])
        level, sources = reconstruct_spysim(early, spy)
        np.testing.assert_allclose(level.pct_change().iloc[1:], [.01, -.02, .1 + fee, -.1 + fee], atol=1e-12)
        self.assertEqual(sources.iloc[2], "historical dividend reconstruction + fee addback")
        self.assertEqual(sources.iloc[3], "SPY Adj Close + fee addback")

    def test_spy_price_scale_does_not_create_a_return_at_the_splice(self):
        ix = pd.bdate_range("1993-01-27", periods=5)
        early = pd.Series([100., 102., 101.], index=ix[:3])
        spy = pd.Series([20., 22., 19.8], index=ix[2:])
        a, _ = reconstruct_spysim(early, spy)
        b, _ = reconstruct_spysim(early, spy * 1000)
        pd.testing.assert_series_equal(a, b)

    def test_missing_early_spy_anchor_is_rejected(self):
        ix = pd.bdate_range("1993-01-27", periods=5)
        with self.assertRaisesRegex(ValueError, "first SPY close"):
            reconstruct_spysim(pd.Series([100., 102.], index=ix[:2]), pd.Series([20., 22., 19.8], index=ix[2:]))

    def test_default_input_is_total_return_and_price_is_explicit_opt_in(self):
        ix = pd.bdate_range("1993-01-27", periods=5)
        with tempfile.TemporaryDirectory() as folder:
            data = Path(folder)
            pd.Series([100., 102., 101.], index=ix[:3], name="close").to_csv(data / "SPYSIM_early.csv")
            pd.Series([20., 22., 19.8], index=ix[2:], name="close").to_csv(data / "SPY.csv")
            pd.Series([50., 51., 50.5, 49., 48.], index=ix, name="close").to_csv(data / "SP500.csv")
            total, _, metadata = load_sma_input(data, ix[-1])
            price, _, price_meta = load_sma_input(data, ix[-1], "price")
            self.assertEqual(metadata["price_basis"], "total return")
            self.assertEqual(price_meta["symbol"], "^GSPC")
            self.assertAlmostEqual(total.iloc[-2] / total.iloc[-3] - 1, .1 + EXPENSE_ADDBACK / 252)
            self.assertAlmostEqual(price.iloc[-2] / price.iloc[-3] - 1, 49 / 50.5 - 1)


if __name__ == "__main__":
    unittest.main()
