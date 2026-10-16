"""Compare independent Python state/indicators to actual author JS outputs."""
import json
from pathlib import Path

import numpy as np
import pandas as pd

from backtest import signals

ROOT = Path(__file__).resolve().parent
data = json.loads((ROOT / 'data/author_data.json').read_text())
reference = json.loads((ROOT / 'results/author_js_reference.json').read_text())
frame = signals(pd.Series(data['closes'], index=pd.to_datetime(data['dates'])))
print('Author fields:', list(reference[-1]))
for row in reference:
    actual = frame.loc[pd.Timestamp(row['date'])]
    # Field names are taken from the downloaded public compute() function.
    assert int(actual.signal) == row['signal'], (row['date'], 'signal')
    np.testing.assert_allclose(actual.vol20, row['v20'], rtol=1e-10, atol=1e-12)
    np.testing.assert_allclose(actual.shock, row['ratio'], rtol=1e-10, atol=1e-12)
    np.testing.assert_allclose(actual.index_drawdown, row['dd'], rtol=1e-10, atol=1e-12)
print(f'PASS: all {len(reference)} daily states and indicator values match author JavaScript.')
