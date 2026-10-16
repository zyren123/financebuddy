"""Validate dated market snapshots at the file boundary."""
import numpy as np
import pandas as pd


def read_series(path):
    frame = pd.read_csv(path, index_col=0, parse_dates=True)
    if frame.shape[1] != 1 or frame.index.has_duplicates or not frame.index.is_monotonic_increasing:
        raise ValueError(f"Expected one sorted, unique dated value column: {path.name}")
    series = pd.to_numeric(frame.iloc[:, 0], errors="raise").dropna()
    if not np.isfinite(series).all():
        raise ValueError(f"Nonfinite values in {path.name}")
    return series
