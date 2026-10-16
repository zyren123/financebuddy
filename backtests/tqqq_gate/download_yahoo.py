"""Fetch Yahoo history with yfinance, preserving raw and dividend-adjusted prices."""
import argparse
import hashlib
import json
import io
import subprocess
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parent
EARLY_URL = "https://raw.githubusercontent.com/SteelCerberus/us-market-data/f018e734c2c0b81981e100cb180802a5ef83a0c5/data/us_market_data.csv"


def normalize_history(frame):
    if frame.empty or "Close" not in frame:
        raise ValueError("Yahoo returned no usable daily history")
    frame = frame.copy()
    # Preserve the US trading date; converting the timezone to UTC first can alter it.
    frame.index = pd.to_datetime(frame.index).tz_localize(None).normalize()
    frame = frame.loc[frame.Close.notna()].sort_index()
    if frame.index.has_duplicates or frame.empty:
        raise ValueError("Yahoo dates must be unique and nonempty")
    return frame


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", default="1985-01-01")
    parser.add_argument("--end", default="2026-10-13", help="Inclusive last completed US session")
    parser.add_argument("--data-dir", type=Path, default=ROOT / "data" / "yahoo")
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--proxy", help="Optional HTTP/SOCKS proxy, e.g. http://127.0.0.1:10808")
    args = parser.parse_args()
    args.data_dir.mkdir(parents=True, exist_ok=True)
    yf.set_tz_cache_location(str(args.data_dir / "yf_cache"))
    if args.proxy:
        yf.config.network.proxy = args.proxy
    yf.config.debug.hide_exceptions = False
    exclusive_end = (date.fromisoformat(args.end) + timedelta(days=1)).isoformat()
    metadata = {"provider": "yfinance / Yahoo Finance", "yfinance_version": yf.__version__,
                "downloaded_at_utc": datetime.now(timezone.utc).isoformat(), "requested_start": args.start,
                "requested_end_inclusive": args.end, "auto_adjust": False, "repair": False, "files": {}, "failures": {}}
    mapping = {"^NDX": "NASDAQ100", "^GSPC": "SP500", "SPY": "SPY", "QQQ": "QQQ", "TQQQ": "TQQQ", "TLT": "TLT", "^IRX": "IRX", "^TNX": "TNX", "^XNDX": "XNDX"}
    for symbol, stem in mapping.items():
        raw_path = args.data_dir / f"{stem}_raw.csv"
        history_start = min(args.start, "1984-01-01") if symbol == "^GSPC" else args.start
        try:
            if raw_path.exists() and not args.refresh:
                raw = pd.read_csv(raw_path, index_col=0, parse_dates=True)
                reused = True
            else:
                raw = yf.Ticker(symbol).history(start=history_start, end=exclusive_end, interval="1d",
                                               auto_adjust=False, back_adjust=False, actions=True, repair=False,
                                               keepna=True, timeout=25)
                raw = normalize_history(raw)
                raw.to_csv(raw_path, index_label="date")
                reused = False
            column = "Adj Close" if symbol in ("SPY", "QQQ", "TQQQ", "TLT") else "Close"
            if column not in raw or raw[column].isna().any() or (raw[column] <= 0).any():
                # IRX can be zero or briefly negative; it is a yield, not an asset price.
                if column not in raw or raw[column].isna().any() or symbol != "^IRX":
                    raise ValueError(f"Missing/invalid {column}; refusing to silently use unadjusted ETF prices")
            files = {f"{stem}.csv": raw[column]}
            if symbol == "QQQ":
                files["QQQ_signal.csv"] = raw.Close
            for filename, series in files.items():
                path = args.data_dir / filename
                series.rename("close").to_csv(path, index_label="date")
                metadata["files"][filename] = {"source": "https://finance.yahoo.com", "symbol": symbol,
                                               "requested_start": history_start,
                                               "price_column": "Close" if filename == "QQQ_signal.csv" else column,
                                               "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "bars": len(raw),
                                               "first": str(raw.index[0].date()), "last": str(raw.index[-1].date()), "reused": reused}
            print(f"{symbol}: {len(raw):,} sessions, {raw.index[0].date()} — {raw.index[-1].date()}", flush=True)
        except Exception as error:
            metadata["failures"][symbol] = {"type": type(error).__name__, "message": str(error)[:250]}
            print(f"{symbol}: failed ({type(error).__name__})", flush=True)
            if type(error).__name__ == "YFRateLimitError":
                print("Yahoo rate limited this request; stopping instead of sending more requests.", flush=True)
                break
    early_path = args.data_dir / "SPYSIM_early.csv"
    early_source = args.data_dir / "SPYSIM_early_source.json"
    if "^NDX" not in metadata["failures"]:
        try:
            if not early_path.exists() or args.refresh:
                command = ["curl", "-LsSf", "--max-time", "40"]
                if args.proxy:
                    command.extend(["--proxy", args.proxy])
                content = subprocess.run([*command, EARLY_URL], capture_output=True, check=True).stdout
                historical = pd.read_csv(io.BytesIO(content), index_col=0, parse_dates=True)
                early = historical.loc["1984-01-01":"1993-01-29", "Adjusted Close"]
                if early.empty or early.isna().any() or (early <= 0).any() or early.index.has_duplicates:
                    raise ValueError("Invalid historical total-return reconstruction")
                early.rename("close").to_csv(early_path, index_label="date")
                early_source.write_text(json.dumps({"url": EARLY_URL, "commit": "f018e734c2c0b81981e100cb180802a5ef83a0c5",
                    "raw_sha256": hashlib.sha256(content).hexdigest(), "expense_deducted_annually": 0.000945,
                    "limitation": "Historical Shiller dividends distributed retrospectively; approximate, not strict point-in-time data"}, indent=2))
            early = pd.read_csv(early_path, index_col=0, parse_dates=True).iloc[:, 0]
            metadata["files"][early_path.name] = {"source": EARLY_URL, "price_column": "Adjusted Close (historical reconstruction)",
                "sha256": hashlib.sha256(early_path.read_bytes()).hexdigest(), "bars": len(early),
                "first": str(early.index[0].date()), "last": str(early.index[-1].date()), "expense_deducted_annually": 0.000945}
            print(f"SPYSIM early reconstruction: {len(early):,} cached rows", flush=True)
        except Exception as error:
            metadata["failures"]["SPYSIM early"] = {"type": type(error).__name__, "message": str(error)[:250]}
    (args.data_dir / "manifest.json").write_text(json.dumps(metadata, indent=2, ensure_ascii=False))
    required = {"NASDAQ100.csv", "SP500.csv", "SPY.csv", "SPYSIM_early.csv", "QQQ.csv", "TQQQ.csv", "TLT.csv"}
    if not required.issubset(metadata["files"]):
        raise SystemExit("Incomplete Yahoo snapshot; details in manifest.json. Existing provider data was not overwritten.")


if __name__ == "__main__":
    main()
