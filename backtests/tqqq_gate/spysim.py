"""Explicit total-return input for the SMA comparison, separate from TQQQ returns."""
import hashlib
import json

import pandas as pd

from market_data import read_series

EXPENSE_ADDBACK = 0.000945


def reconstruct_spysim(early_adjusted, spy_adjusted, expense=EXPENSE_ADDBACK):
    """Undo the historical model fee, then splice actual SPY total returns.

    The early close is already dividend adjusted and fee deducted. The first SPY
    price cannot supply a return; its date remains an early modeled return, with
    actual SPY returns beginning at the second price. No early prices are filled.
    """
    first_spy = spy_adjusted.index[0]
    if first_spy not in early_adjusted.index:
        raise ValueError("Early total-return history must cover the first SPY close for a continuous splice")
    if (early_adjusted <= 0).any() or (spy_adjusted <= 0).any():
        raise ValueError("Total-return inputs must be positive")
    early = early_adjusted.loc[:first_spy].pct_change(fill_method=None)
    actual = spy_adjusted.pct_change(fill_method=None).iloc[1:]
    returns = pd.concat([early, actual]) + expense / 252
    returns.iloc[0] = 0.0
    if returns.index.has_duplicates or returns.isna().any() or (returns <= -1).any():
        raise ValueError("Invalid total-return splice")
    level = (1 + returns).cumprod().rename("SPYSIM total-return proxy")
    source = pd.Series("SPY Adj Close + fee addback", index=level.index)
    source.loc[early.index] = "historical dividend reconstruction + fee addback"
    return level, source


def load_sma_input(data, end, basis="spysim"):
    if basis == "price":
        close = read_series(data / "SP500.csv").loc[:end]
        return close, pd.Series("Yahoo ^GSPC Close", index=close.index), {
            "signal_source": "sp500_price", "symbol": "^GSPC", "price_basis": "price index, excluding dividends",
            "strategy_label": "SP500 Price SMA200 +/-4%", "display_basis": "标普 500 价格指数（不含分红）",
            "model_note": "均线信号采用 ^GSPC 价格指数，交易收益仍采用 TQQQ 分红复权收益。"}
    early = read_series(data / "SPYSIM_early.csv")
    spy = read_series(data / "SPY.csv")
    close, source = reconstruct_spysim(early, spy)
    metadata = {"signal_source": "spysim_total_return_proxy", "symbol": "SPYSIM proxy", "price_basis": "total return",
                "strategy_label": "SPYSIM TR SMA200 +/-4%", "display_basis": "SPYSIM 总收益近似（含分红复投）",
                "expense_addback": EXPENSE_ADDBACK,
                "model_note": "1993 年前采用含分红的历史重构，季度股息包含回溯估计；1993 年后采用 SPY 复权收益加回 0.0945% 年费。这是 SPYSIM 近似，不是 Testfol 原始序列。TQQQ 收益口径保持原有分段。",
                "files": {name: hashlib.sha256((data / name).read_bytes()).hexdigest() for name in ("SPYSIM_early.csv", "SPY.csv")}}
    source_file = data / "SPYSIM_early_source.json"
    if source_file.exists():
        metadata["early_source"] = json.loads(source_file.read_text())
    return close.loc[:end], source.loc[:end], metadata
