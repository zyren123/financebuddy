"""DSR and CSCV PBO on noise, on a genuine edge, and in the single-trial limit."""
import unittest
from itertools import combinations
from math import sqrt
from statistics import NormalDist

import numpy as np
import pandas as pd

from overfit import deflated_sharpe, pbo_cscv


def noise(edge=0.0, seed=5):
    frame = pd.DataFrame(np.random.default_rng(seed).normal(0, .01, (4000, 20)))
    frame[0] += edge * .01
    return frame


def best_column_dsr(frame):
    sharpes = frame.mean() / frame.std(ddof=1)
    return deflated_sharpe(frame[sharpes.idxmax()], frame.shape[1], sharpes.var(ddof=1))["dsr"]


class OverfitTests(unittest.TestCase):
    def test_pure_noise_selection_is_a_coin_flip(self):
        # One noise panel's PBO ranges about 0.14-0.88 across seeds; only the average is near 0.5.
        results = [pbo_cscv(noise(seed=s)) for s in range(10)]
        self.assertEqual(results[0]["n_splits"], 12870)
        self.assertTrue(.35 < np.mean([r["pbo"] for r in results]) < .65)
        dsr = [best_column_dsr(noise(seed=s)) for s in range(20)]
        self.assertLess(np.median(dsr), .5)
        self.assertLess(max(dsr), .95)

    def test_deflation_removes_the_selected_noise_winners_apparent_significance(self):
        frame = noise(seed=0)
        sharpes = frame.mean() / frame.std(ddof=1)
        undeflated = deflated_sharpe(frame[sharpes.idxmax()], 1, 0.0)["dsr"]
        self.assertGreater(undeflated, .9)
        self.assertLess(best_column_dsr(frame), .5)

    def test_vectorized_cscv_matches_direct_loop(self):
        frame = pd.DataFrame(np.random.default_rng(1).normal(0, .01, (403, 6)))
        blocks = [frame.iloc[3 + i * 50:3 + (i + 1) * 50] for i in range(8)]
        sharpe = lambda x: x.mean() / x.std(ddof=1)
        logits = []
        for chosen in combinations(range(8), 4):
            ins = pd.concat([blocks[i] for i in chosen])
            outs = pd.concat([blocks[i] for i in range(8) if i not in chosen])
            omega = sharpe(outs).rank()[sharpe(ins).idxmax()] / 7
            logits.append(np.log(omega / (1 - omega)))
        result = pbo_cscv(frame, blocks=8)
        self.assertAlmostEqual(result["pbo"], np.mean(np.array(logits) <= 0))
        self.assertAlmostEqual(result["median_logit"], np.median(logits))
        self.assertEqual(result["dropped_leading_sessions"], 3)

    def test_genuine_drift_survives_selection(self):
        frame = noise(edge=.1)
        self.assertLess(pbo_cscv(frame)["pbo"], .1)
        self.assertGreater(best_column_dsr(frame), .95)

    def test_single_trial_dsr_is_psr_against_zero(self):
        r = pd.Series(np.random.default_rng(9).normal(.0005, .01, 2500))
        sr, skew, kurt = r.mean() / r.std(ddof=1), r.skew(), r.kurt() + 3
        psr = NormalDist().cdf(sr * sqrt(len(r) - 1) / sqrt(1 - skew * sr + (kurt - 1) / 4 * sr ** 2))
        result = deflated_sharpe(r, 1, 123.0)
        self.assertAlmostEqual(result["dsr"], psr)
        self.assertEqual(result["expected_max_sharpe_daily"], 0.0)

    def test_more_trials_raise_the_bar(self):
        r = pd.Series(np.random.default_rng(9).normal(.0005, .01, 2500))
        self.assertGreater(deflated_sharpe(r, 10, 1e-4)["dsr"], deflated_sharpe(r, 100, 1e-4)["dsr"])


if __name__ == "__main__":
    unittest.main()
