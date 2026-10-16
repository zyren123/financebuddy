"""Compare next-open and close execution using actual TQQQ OHLC history.

This audit does not change the main report. The synthetic pre-2010 daily
returns cannot identify a TQQQ overnight/intraday split.
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

from backtest import metrics, portfolio, signals
from long_history import build_history

ROOT = Path(__file__).resolve().parent


def next_open_portfolio(raw, cash, target_at_open, cash_overnight_fraction=1.0):
    """Old holdings earn the gap; new holdings earn open-to-close returns.

    Cash remains the existing annual-rate/252 proxy. The default assigns
    its daily accrual to the overnight leg; alternative splits are audited.
    The first date is a close valuation, with the initial purchase cost only.
    """
    adjusted_open = raw.Open * raw["Adj Close"] / raw.Close
    gap = adjusted_open / raw["Adj Close"].shift(1) - 1
    intraday = raw.Close / raw.Open - 1
    np.testing.assert_allclose(
        ((1 + gap) * (1 + intraday) - 1).iloc[1:],
        raw["Adj Close"].pct_change(fill_method=None).iloc[1:],
        atol=1e-12,
    )
    old = target_at_open.shift(1).fillna(0).astype(int)
    switch = target_at_open.ne(target_at_open.shift(1))
    overnight_return = np.where(old == 1, gap, (1 + cash) ** cash_overnight_fraction - 1)
    intraday_return = np.where(target_at_open == 1, intraday, (1 + cash) ** (1 - cash_overnight_fraction) - 1)
    costs = switch.astype(float) * 2.5 / 10000
    net = pd.Series((1 + overnight_return) * (1 - costs) * (1 + intraday_return) - 1, index=raw.index)
    net.iloc[0] = -costs.iloc[0]
    if net.isna().any():
        raise ValueError("Missing next-open return input")
    equity = (1 + net).cumprod()
    return pd.DataFrame({
        "position_overnight": old,
        "position_close": target_at_open,
        "position_earning": target_at_open,  # Intraday exposure, not full-day exposure.
        "switch": switch,
        "net_return": net,
        "equity": equity,
        "drawdown": equity / equity.cummax().clip(lower=1) - 1,
    })


def main():
    data = ROOT / "data" / "yahoo"
    history, _, _ = build_history(data, "2026-10-13")
    signal = signals(history.ndx_close).signal
    raw = pd.read_csv(data / "TQQQ_raw.csv", index_col=0, parse_dates=True)
    index = history.loc[raw.index[0]:raw.index[-1]].index
    raw = raw.reindex(index)
    if raw[["Open", "Close", "Adj Close"]].isna().any().any() or (raw[["Open", "Close", "Adj Close"]] <= 0).any().any():
        raise ValueError("Missing or nonpositive actual TQQQ OHLC prices")
    cash = history.cash_return.reindex(index)
    at_open = signal.shift(1).reindex(index)
    if at_open.isna().any():
        raise ValueError("Missing prior-close signal")
    at_open = at_open.astype(int)
    frames = {
        "signal_close": portfolio(history.tqqq_return.reindex(index), cash, signal.reindex(index), 2.5),
        "next_open": next_open_portfolio(raw, cash, at_open),
        "next_close": portfolio(history.tqqq_return.reindex(index), cash, at_open, 2.5),
    }
    fields = ["start", "end", "cagr", "max_drawdown", "growth_of_1"]
    results = {name: {k: m[k] for k in fields} for name, frame in frames.items() for m in [metrics(frame, cash)]}
    cash_sensitivity = {}
    for fraction in (0.0, 0.5, 1.0):
        frame = next_open_portfolio(raw, cash, at_open, fraction)
        m = metrics(frame, cash)
        cash_sensitivity[str(fraction)] = {k: m[k] for k in fields}
    output = ROOT / "results" / "next_open_audit"
    output.mkdir(parents=True, exist_ok=True)
    frames["next_open"].to_csv(output / "next_open_daily.csv", index_label="date")
    report = {
        "strategy": "TQQQ / T-bill three gates",
        "results": results,
        "cash_overnight_fraction_sensitivity": cash_sensitivity,
        "assumptions": [
            "Actual Yahoo TQQQ OHLC only; no pre-2010 synthetic opening prices.",
            "Signal uses prior completed NDX close; old position earns overnight, new position earns intraday.",
            "Adjusted open = Open * Adj Close / Close; uses provider adjusted OHLC dividend treatment.",
            "2.5bp per switch, including initial purchase; no forced end liquidation.",
            "T-bill is a daily rate/252 proxy; default cash accrual assigned overnight, with split sensitivity.",
            "First date is a close valuation; it earns no price return.",
            "Daily Open is a historical price proxy; actual fills/slippage can differ.",
        ],
    }
    (output / "summary.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
