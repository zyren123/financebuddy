"""1985+ backtest with explicitly modeled pre-ETF segments and actual later ETFs."""
import argparse
import json
from dataclasses import asdict
from pathlib import Path

import numpy as np
import pandas as pd

from backtest import (Parameters, aligned, annual_returns, metrics, portfolio,
                      signals, sma_band_signals, write_report)
from market_data import read_series
from models import overlap_validation, par_bond_returns, splice_real, synthetic_leverage
from spysim import load_sma_input

ROOT = Path(__file__).resolve().parent


def available_yields(series, index, label):
    values = series.reindex(series.index.union(index)).sort_index().ffill().reindex(index) / 100
    # Rate histories can have market-holiday gaps. Large holes must not become fake flat yields.
    observed_date = pd.Series(series.index, index=series.index).reindex(series.index.union(index)).sort_index().ffill().reindex(index)
    age = (index.to_series() - observed_date).dt.days
    if values.isna().any() or age.gt(10).any():
        raise ValueError(f"{label}: missing or more than 10 calendar days stale; no long-gap forward fill")
    return values


def build_history(data, end, dividend_yield=0.0, financing_spread=0.0045):
    ndx = read_series(data / "NASDAQ100.csv")
    prices = {name: read_series(data / f"{name}.csv") for name in ("QQQ", "TQQQ", "TLT")}
    last = min(pd.Timestamp(end), ndx.index[-1], *(s.index[-1] for s in prices.values()))
    ndx = ndx.loc[:last]
    index = ndx.index
    bill_file = data / ("IRX.csv" if (data / "IRX.csv").exists() else "DTB3.csv")
    bond_file = data / ("TNX.csv" if (data / "TNX.csv").exists() else "DGS10.csv")
    bill_yield = available_yields(read_series(bill_file), index, bill_file.name)
    bond_yield = available_yields(read_series(bond_file), index, bond_file.name)
    # Today's earned cash and leverage financing use the previous close's known rate.
    bill_prior = bill_yield.shift(1)
    bill_prior.iloc[0] = bill_yield.iloc[0]  # First row is a valuation, never an earned return.
    index_returns = ndx.pct_change(fill_method=None)
    index_returns.iloc[0] = 0.0
    underlying_model = index_returns + dividend_yield / 252
    underlying_model.iloc[0] = 0.0
    underlying, underlying_source = splice_real(underlying_model, prices["QQQ"], "QQQ")
    leverage_model = synthetic_leverage(underlying, bill_prior, financing_spread=financing_spread)
    leveraged, leverage_source = splice_real(leverage_model, prices["TQQQ"], "TQQQ")
    bond_model = par_bond_returns(bond_yield)
    bond_model.iloc[0] = 0.0
    bond, bond_source = splice_real(bond_model, prices["TLT"], "TLT")
    cash = bill_prior / 252
    frame = pd.DataFrame({"ndx_close": ndx, "underlying_return": underlying, "underlying_source": underlying_source,
                          "tqqq_return": leveraged, "tqqq_source": leverage_source,
                          "defensive_bond_return": bond, "bond_source": bond_source,
                          "cash_return": cash, "bill_yield_prior": bill_prior, "bond_yield": bond_yield,
                          "synthetic_tqqq_return": leverage_model, "synthetic_bond_return": bond_model})
    validation = {"tqqq": overlap_validation(leverage_model, prices["TQQQ"]),
                  "bond": overlap_validation(bond_model, prices["TLT"])}
    return frame, validation, (bill_file.name, bond_file.name)


def make_portfolios(history, signal_frame, ma_signal_frame, index, lag, cost, ma_label):
    target = signal_frame.signal.shift(lag).fillna(0).reindex(index)
    ma_target = aligned(ma_signal_frame.signal.shift(lag).fillna(0), index, "SP500 SMA200 signal")
    return {
        "TQQQ / T-bill": portfolio(history.tqqq_return.reindex(index), history.cash_return.reindex(index), target, cost),
        "TQQQ / TLT model": portfolio(history.tqqq_return.reindex(index), history.defensive_bond_return.reindex(index), target, cost),
        "TQQQ buy & hold": portfolio(history.tqqq_return.reindex(index), history.cash_return.reindex(index), pd.Series(1, index=index), cost),
        "Index / QQQ buy & hold": portfolio(history.underlying_return.reindex(index), history.cash_return.reindex(index), pd.Series(1, index=index), cost),
        f"{ma_label} / T-bill": portfolio(history.tqqq_return.reindex(index), history.cash_return.reindex(index), ma_target, cost),
        f"{ma_label} / TLT model": portfolio(history.tqqq_return.reindex(index), history.defensive_bond_return.reindex(index), ma_target, cost),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=ROOT / "data" / "yahoo")
    parser.add_argument("--output", type=Path, default=ROOT / "results" / "long_history")
    parser.add_argument("--start", default="1985-10-01")
    parser.add_argument("--end", default="2026-10-13")
    parser.add_argument("--sma-basis", choices=("spysim", "price"), default="spysim")
    parser.add_argument("--execution-lag", type=int, choices=(0, 1, 2), default=1)
    parser.add_argument("--switch-cost-bps", type=float, default=2.5)
    parser.add_argument("--pre-qqq-dividend-yield", type=float, default=0.0, help="Assumed annual index dividend yield before real QQQ, e.g. 0.005")
    parser.add_argument("--financing-spread", type=float, default=0.0045)
    args = parser.parse_args()
    if not 0 <= args.switch_cost_bps < 10000 or not 0 <= args.pre_qqq_dividend_yield <= .1 or not 0 <= args.financing_spread <= .1:
        parser.error("Invalid cost/dividend/financing assumption")
    history, validation, rate_files = build_history(args.data_dir, args.end, args.pre_qqq_dividend_yield, args.financing_spread)
    if pd.Timestamp(args.start) < history.index[0]:
        raise ValueError(f"Requested start {args.start}, but actual NDX history starts {history.index[0].date()}; refusing to fabricate earlier index prices")
    sf = signals(history.ndx_close)
    ma_prices, ma_sources, ma_metadata = load_sma_input(args.data_dir, history.index[-1], args.sma_basis)
    ma_label = ma_metadata["strategy_label"]
    ma_sf = sma_band_signals(ma_prices)
    ma_sf["source"] = ma_sources
    index = history.loc[args.start:args.end].index
    if len(index) < 3:
        raise ValueError("Backtest window too short")
    frames = make_portfolios(history, sf, ma_sf, index, args.execution_lag, args.switch_cost_bps, ma_label)
    rf = history.cash_return.reindex(index)
    results = {name: metrics(frame, rf) for name, frame in frames.items()}
    results["Index / QQQ buy & hold"]["risk_exposure"] = 0.0
    annual = pd.DataFrame({name: annual_returns(frame) for name, frame in frames.items()})
    paths = {"equity": pd.DataFrame({name: frame.equity for name, frame in frames.items()}),
             "drawdown": pd.DataFrame({name: frame.drawdown for name, frame in frames.items()})}
    output = args.output
    output.mkdir(parents=True, exist_ok=True)
    history.to_csv(output / "asset_returns_and_sources.csv", index_label="date")
    sf.to_csv(output / "signals.csv", index_label="date")
    ma_sf.to_csv(output / "sma200_signals.csv", index_label="date")
    annual.to_csv(output / "annual_returns.csv", index_label="year")
    for key, frame in paths.items():
        frame.to_csv(output / f"{key}.csv", index_label="date")
    trades = []
    for name, frame in frames.items():
        log = frame.loc[frame.switch, ["position_close", "cost_fraction", "equity"]].copy()
        log["strategy"] = name
        signal_frame = ma_sf if name.startswith(ma_label) else sf
        source_dates = pd.Series(signal_frame.index, index=signal_frame.index).shift(args.execution_lag)
        log["signal_date"] = source_dates.reindex(log.index) if "buy & hold" not in name else pd.NaT
        log["risk_data_source"] = history.tqqq_source.reindex(log.index)
        trades.append(log)
        filename = name.replace("+/-", "band_").replace("%", "pct").replace(" / ", "_").replace(" & ", "_").replace(" ", "_")
        frame.to_csv(output / f"{filename}_daily.csv", index_label="date")
    pd.concat(trades).to_csv(output / "trades.csv", index_label="execution_close_date")
    sensitivities = []
    for lag in (0, 1, 2):
        for cost in (0.0, 2.5, 5.0, 10.0):
            for name, frame in make_portfolios(history, sf, ma_sf, index, lag, cost, ma_label).items():
                if "buy & hold" in name:
                    continue
                sensitivities.append({"strategy": name, "defensive": "T-bill" if name.endswith("T-bill") else "20y bond / TLT", "execution_lag": lag,
                                      "switch_cost_bps": cost, **metrics(frame, rf)})
    sensitivity = pd.DataFrame(sensitivities)
    sensitivity.to_csv(output / "sensitivity.csv", index=False)
    # Vary only uncertain early modeling inputs, not the gate parameters.
    model_sensitivity = []
    for dividend in (0.0, 0.005, 0.01):
        for spread in (0.0045, 0.01, 0.02):
            variant, _, _ = build_history(args.data_dir, args.end, dividend, spread)
            for name, frame in make_portfolios(variant, sf, ma_sf, index, args.execution_lag, args.switch_cost_bps, ma_label).items():
                if "buy & hold" in name:
                    continue
                model_sensitivity.append({"strategy": name, "pre_qqq_dividend_yield": dividend, "financing_spread": spread, **metrics(frame, rf)})
    pd.DataFrame(model_sensitivity).to_csv(output / "model_sensitivity.csv", index=False)
    first_trade = frames["TQQQ / T-bill"].index[frames["TQQQ / T-bill"].position_close == 1][0]
    real_dates = {name: str(history.index[history[col] == "actual"][0].date()) for name, col in
                  (("QQQ", "underlying_source"), ("TQQQ", "tqqq_source"), ("TLT", "bond_source"))}
    manifest_path = args.data_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    assumptions = [
        f"估值区间：{index[0].date()} — {index[-1].date()}，{len(index):,} 个收盘；初始 $1，税前、无定投，收益复投。",
        f"来源：{manifest.get('provider', str(args.data_dir))}；原始下载和 SHA-256 清单保存在数据目录。",
        f"NDX 最早可用 {history.index[0].date()}。前 250 个收益预热期间门控组合持有短债或债券；第一次 TQQQ 建仓在 {first_trade.date()}，没有用未来数据补齐早期信号。",
        f"均线对照：{ma_metadata['display_basis']} 高于 SMA200×1.04 买入 TQQQ，低于 SMA200×0.96 退出；中间保持原仓位，单日触发。信号自 {ma_prices.index[0].date()} 起计算，在投资区间前预热。",
        ma_metadata["model_note"],
        f"1×基础收益：{real_dates['QQQ']} 前为 NDX 价格收益＋假设年分红率 {args.pre_qqq_dividend_yield:.2%}/252，之后真实 QQQ Adj Close 收益；没有声称取得 1985 年总收益指数。",
        f"TQQQ：{real_dates['TQQQ']} 前每日收益=3×基础收益−[2×(短债年率＋{args.financing_spread:.2%})＋0.95%]/252；之后真实 TQQQ Adj Close，不重复扣融资或基金费。",
        f"债券：{real_dates['TLT']} 前为每日滚动的 20 年平价债券、半年付息、平坦收益率曲线，由 {rate_files[1]} 十年期收益率驱动，扣年费 0.15%；之后真实 TLT Adj Close。早期是债券模型，不是真实 TLT。",
        f"现金/融资使用 {rate_files[0]} 前一交易日贴现报价；现金日收益=年率/252，未模拟真实短券的贴现率转投资收益率。债券模型使用自然日 aging，含周末时间流逝。",
        f"信号在收盘计算，延迟 {args.execution_lag} 个收盘成交；每次切换总成本 {args.switch_cost_bps:g}bp，两次往返 {2*args.switch_cost_bps:g}bp；期末不强制平仓。",
        f"模型重叠期验证：合成 TQQQ 与真实基金日收益相关 {validation['tqqq']['daily_correlation']:.4f}，年化跟踪误差 {validation['tqqq']['annual_tracking_error']:.2%}；债券模型与 TLT 相关 {validation['bond']['daily_correlation']:.4f}，跟踪误差 {validation['bond']['annual_tracking_error']:.2%}。高相关不证明 1985 年危机融资或早期债券假设成立。",
        "策略参数未优化。首次估值不赚日收益；Sharpe 扣现金代理利率，CAGR 按自然日。早期分红/融资利差的 36 组结果在 model_sensitivity.csv。",
    ]
    metadata = {"history_type": "synthetic before actual ETFs", "parameters": asdict(Parameters()), "results": results,
                "execution_lag": args.execution_lag, "switch_cost_bps": args.switch_cost_bps,
                "sma_comparison": {**ma_metadata, "window": 200, "band": 0.04, "confirmation_days": 1},
                "pre_qqq_dividend_yield": args.pre_qqq_dividend_yield, "financing_spread": args.financing_spread,
                "first_risk_trade": str(first_trade.date()), "real_return_starts": real_dates,
                "model_validation": validation, "assumptions": assumptions, "data_manifest": manifest}
    (output / "summary.json").write_text(json.dumps(metadata, indent=2, ensure_ascii=False, allow_nan=False))
    write_report(output, results, assumptions, annual, paths, sensitivity, history_label="上市前合成＋上市后真实 ETF",
                 strategy_description="1985 起的三门择时与标普 SMA200 ±4% 择时交易 TQQQ；上市前资产收益采用模型。",
                 sma_basis=ma_metadata["display_basis"], sma_model_note=ma_metadata["model_note"])
    for name, m in results.items():
        print(f"{name:24s} CAGR {m['cagr']:7.2%} | max DD {m['max_drawdown']:7.2%} | growth {m['growth_of_1']:,.2f}")
    print(f"Model validation: {json.dumps(validation)}")
    print(f"Report: {output.resolve() / 'report.html'}")


if __name__ == "__main__":
    main()
