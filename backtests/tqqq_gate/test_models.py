"""Financial behavior checks for synthetic history and real-data boundaries."""
import unittest

import numpy as np
import pandas as pd

from download_yahoo import normalize_history
from long_history import available_yields
from models import par_bond_returns, splice_real, synthetic_leverage


class ModelTests(unittest.TestCase):
    def test_daily_leverage_deducts_borrowed_notional_and_expense(self):
        underlying = pd.Series([.01, -.02])
        rate = pd.Series([.05, .05])
        expected = 3 * underlying - (2 * (.05 + .0045) + .0095) / 252
        pd.testing.assert_series_equal(synthetic_leverage(underlying, rate), expected)

    def test_constant_yield_bond_earns_carry_once_including_weekend(self):
        ix = pd.to_datetime(["2024-01-05", "2024-01-08", "2024-01-09"])
        rate = pd.Series(.05, index=ix)
        actual = par_bond_returns(rate, expense=0)
        expected = (1 + .05 / 2) ** (2 * np.array([3, 1]) / 365.25) - 1
        np.testing.assert_allclose(actual.iloc[1:], expected, atol=1e-14, rtol=1e-10)

    def test_long_bond_loses_value_when_yield_rises(self):
        ix = pd.bdate_range("2024-01-02", periods=3)
        result = par_bond_returns(pd.Series([.04, .05, .04], index=ix), expense=0)
        self.assertLess(result.iloc[1], 0)
        self.assertGreater(result.iloc[2], 0)

    def test_real_returns_begin_at_second_price_and_no_extra_fee(self):
        ix = pd.bdate_range("2024-01-02", periods=5)
        proxy = pd.Series(.02, index=ix)
        prices = pd.Series([100, 110, 99], index=ix[2:])
        result, source = splice_real(proxy, prices, "ETF")
        np.testing.assert_allclose(result, [.02, .02, .02, .1, -.1])
        self.assertEqual(source.tolist(), ["synthetic", "synthetic", "synthetic", "actual", "actual"])

    def test_missing_real_session_is_not_replaced_by_model(self):
        ix = pd.bdate_range("2024-01-02", periods=5)
        with self.assertRaisesRegex(ValueError, "refusing to fill"):
            splice_real(pd.Series(.02, index=ix), pd.Series([100, 110, 99], index=ix[[0, 2, 4]]), "ETF")

    def test_leveraged_wipeout_fails_instead_of_clipping(self):
        with self.assertRaisesRegex(ValueError, "wiped out"):
            synthetic_leverage(pd.Series([-.34]), pd.Series([.04]))

    def test_stale_yield_cannot_fill_years_of_missing_history(self):
        ix = pd.to_datetime(["1987-01-02", "1993-09-30"])
        with self.assertRaisesRegex(ValueError, "stale"):
            available_yields(pd.Series([5.0], index=ix[:1]), ix, "20-year yield")

    def test_yahoo_trading_date_preserved_without_utc_conversion(self):
        ix = pd.DatetimeIndex(["2024-01-02 00:00:00"], tz="America/New_York")
        result = normalize_history(pd.DataFrame({"Close": [100]}, index=ix))
        self.assertEqual(result.index[0], pd.Timestamp("2024-01-02"))
        self.assertIsNone(result.index.tz)


if __name__ == "__main__":
    unittest.main()
