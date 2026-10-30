"""Look-ahead, range and formula checks for every pre-registered rule family."""
import unittest

import numpy as np
import pandas as pd

from rules import FAMILIES, candidates, dual_ma, tsmom, vol_target


def prices(n=650, seed=11):
    rng = np.random.default_rng(seed)
    ix = pd.bdate_range("2000-01-03", periods=n)
    return pd.Series(100 * np.cumprod(1 + rng.normal(.0004, .02, n)), index=ix)


class RuleTests(unittest.TestCase):
    def test_registry_is_the_pre_registered_48_trials(self):
        found = candidates()
        counts = {name: sum(c.family == name for c in found) for name in FAMILIES}
        self.assertEqual(counts, {"three_gate": 1, "sma": 15, "dual_ma": 6, "tsmom": 4, "vol_target": 8,
                                  "fixed_mix": 9, "trend_vol": 4, "spysim_sma": 1})
        self.assertEqual(len({c.label for c in found}), 48)
        self.assertEqual({n for n, f in FAMILIES.items() if f.post_hoc}, {"three_gate", "spysim_sma"})

    def test_every_candidate_ignores_future_prices_and_stays_in_unit_range(self):
        close = prices()
        changed = close.copy()
        changed.iloc[420:] *= np.linspace(.2, 3, len(close) - 420)
        for c in candidates():
            with self.subTest(c.label):
                fn = FAMILIES[c.family].weight_fn
                original = fn(close, **c.params)
                pd.testing.assert_series_equal(original.iloc[:420], fn(changed, **c.params).iloc[:420])
                pd.testing.assert_series_equal(original.iloc[:420], fn(close.iloc[:420], **c.params))
                valid = original.dropna()
                self.assertGreater(len(valid), 0)
                self.assertTrue(valid.between(0, 1).all())
                self.assertFalse(original.loc[valid.index[0]:].isna().any())

    def test_vol_target_matches_annualized_sample_std_and_caps_at_one(self):
        close = pd.Series(100 * np.cumprod([1] + [1.03, 0.97] * 15))
        weight = vol_target(close, window=20, target=0.30)
        sigma = np.std(close.pct_change().iloc[-20:], ddof=1) * np.sqrt(252)
        self.assertAlmostEqual(weight.iloc[-1], 0.30 / (3 * sigma))
        self.assertTrue(weight.iloc[:20].isna().all())
        self.assertEqual(vol_target(pd.Series(np.linspace(100, 101, 30)), 20, 0.5).iloc[-1], 1.0)

    def test_trend_rules_follow_direction(self):
        up, down = pd.Series(np.linspace(100, 200, 300)), pd.Series(np.linspace(200, 100, 300))
        self.assertEqual(tsmom(up, 63).dropna().unique().tolist(), [1.0])
        self.assertEqual(tsmom(down, 63).dropna().unique().tolist(), [0.0])
        self.assertTrue(tsmom(up, 63).iloc[:63].isna().all())
        turn = pd.concat([up, pd.Series(np.linspace(200, 50, 300))], ignore_index=True)
        crossover = dual_ma(turn, 20, 100)
        self.assertEqual(crossover.iloc[299], 1.0)
        self.assertEqual(crossover.iloc[-1], 0.0)
        self.assertTrue(crossover.iloc[:99].isna().all())


if __name__ == "__main__":
    unittest.main()
