"""Fractional TQQQ weights with daily drift and band rebalancing, on backtest.portfolio's timing."""
import numpy as np
import pandas as pd


def weighted_portfolio(risk_return, defensive_return, target_at_close, band=0.0, switch_cost_bps=2.5):
    """target_at_close[t] is traded AFTER the drifted holding earns t's return.

    Trade when drift leaves the band or exposure flips between zero and nonzero;
    cost is charged on |traded weight|. Funding the initial $1 trades one full
    unit, as in portfolio(), so 0/1 targets reproduce it exactly.
    """
    frame = pd.DataFrame({"risk_return": risk_return, "defensive_return": defensive_return, "target": target_at_close})
    risk, safe, target = (frame[c].to_numpy(float) for c in ("risk_return", "defensive_return", "target"))
    n = len(frame)
    held, earning, gross, turnover = np.empty(n), np.zeros(n), np.zeros(n), np.zeros(n)
    weight = held[0] = target[0]
    turnover[0] = 1.0
    for t in range(1, n):
        earning[t] = weight
        gross[t] = weight * risk[t] + (1 - weight) * safe[t]
        weight = weight * (1 + risk[t]) / (1 + gross[t])
        if (weight > 0) != (target[t] > 0) or abs(weight - target[t]) > band:
            turnover[t], weight = abs(target[t] - weight), target[t]
        held[t] = weight
    frame["position_close"], frame["position_earning"], frame["gross_return"] = held, earning, gross
    frame["turnover"] = turnover
    frame["switch"] = turnover > 0
    frame["cost_fraction"] = turnover * switch_cost_bps / 10000
    frame["net_return"] = (1 + frame.gross_return) * (1 - frame.cost_fraction) - 1
    frame["equity"] = (1 + frame.net_return).cumprod()
    frame["drawdown"] = frame.equity / frame.equity.cummax().clip(lower=1) - 1
    return frame
