"""Daily-reset leverage and a rolling par-bond model for pre-ETF history."""
import numpy as np
import pandas as pd

from backtest import aligned


def synthetic_leverage(underlying_return, annual_cash_rate, leverage=3.0,
                       financing_spread=0.0045, expense=0.0095):
    # Expense and financing apply only to the synthetic segment, not the real ETF.
    result = leverage * underlying_return - ((leverage - 1) * (annual_cash_rate + financing_spread) + expense) / 252
    if (result.dropna() <= -1).any():
        raise ValueError("Synthetic leveraged fund is wiped out; cannot continue or clip its return")
    return result


def par_bond_returns(annual_yield, maturity=20, expense=0.0015):
    """Roll a par bond daily, with semiannual coupons and a flat yield curve.

    At the prior close buy a par bond with coupon fixed to yesterday's yield.
    At today's close price its remaining cash flows at today's yield. Dirty-price
    appreciation already includes coupon accrual, so adding a second coupon would
    double count carry. Calendar-day aging handles weekends correctly.
    """
    if maturity < 1 or maturity * 2 != int(maturity * 2):
        raise ValueError("Bond maturity must be a positive multiple of half a year")
    if annual_yield.isna().any() or (annual_yield <= -2).any():
        raise ValueError("Missing or invalid bond yields")
    previous = annual_yield.shift(1)
    elapsed = annual_yield.index.to_series().diff().dt.days / 365.25
    if elapsed.iloc[1:].gt(0.5).any():
        raise ValueError("Yield interval crosses a coupon payment; missing history needs repair")
    # Vectorized discounted cash flows, not an optimized duration approximation.
    periods = np.arange(1, int(maturity * 2) + 1)
    remaining = periods[None, :] - 2 * elapsed.to_numpy()[:, None]
    discount = (1 + annual_yield.to_numpy()[:, None] / 2) ** (-remaining)
    coupons = previous.to_numpy()[:, None] / 2
    dirty_price = (discount * coupons).sum(axis=1) + discount[:, -1]
    gross = pd.Series(dirty_price - 1, index=annual_yield.index)
    return (1 + gross) * (1 - expense / 252) - 1


def splice_real(proxy_return, actual_prices, label):
    """Replace only dates with observable real ETF returns; no filled asset prices."""
    result = proxy_return.copy()
    source = pd.Series("synthetic", index=result.index)
    actual = actual_prices.pct_change(fill_method=None).dropna()
    after = result.index[(result.index >= actual.index[0]) & (result.index <= actual.index[-1])]
    values = aligned(actual, after, label)
    result.loc[after] = values
    source.loc[after] = "actual"
    if result.index[-1] > actual.index[-1]:
        raise ValueError(f"{label}: requested end exceeds real ETF coverage; refusing to revert to synthesis")
    return result, source


def overlap_validation(model_return, actual_prices):
    actual = actual_prices.pct_change(fill_method=None)
    overlap = pd.concat([model_return.rename("model"), actual.rename("actual")], axis=1).dropna()
    difference = overlap.model - overlap.actual
    return {"first": str(overlap.index[0].date()), "last": str(overlap.index[-1].date()), "sessions": len(overlap),
            "daily_correlation": float(overlap.model.corr(overlap.actual)),
            "annual_tracking_error": float(difference.std(ddof=1) * np.sqrt(252)),
            "annualized_mean_return_difference": float(difference.mean() * 252)}
