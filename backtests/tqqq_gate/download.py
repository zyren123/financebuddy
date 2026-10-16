"""Quota-conscious Twelve Data snapshots with incremental, adjustment-aware caches."""
import argparse
import csv
import hashlib
import io
import json
import math
import os
import subprocess
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent.parent
SOURCE = 'https://api.twelvedata.com/time_series'
# First possible requested session; earlier empty ranges do not need querying.
INCEPTION = {'TQQQ': '2010-02-11', 'QQQ': '1999-03-10', 'TLT': '2002-07-22'}
SPECS = [('TQQQ', 'all', 'TQQQ.csv'), ('QQQ', 'all', 'QQQ.csv'),
         ('TLT', 'all', 'TLT.csv'), ('QQQ', 'splits', 'QQQ_signal.csv')]


def request(url):
    try:
        if url.startswith('https://fred.stlouisfed.org/'):
            result = subprocess.run(['curl', '-LsSf', '--retry', '2', '--max-time', '30', url], capture_output=True, check=True)
            return result.stdout
        with urlopen(Request(url, headers={'User-Agent': 'FinanceBuddy-backtest/1.0'}), timeout=40) as response:
            return response.read()
    except Exception as error:
        raise RuntimeError(f'Download failed ({type(error).__name__}); check network/provider access') from None


def api_key():
    key = os.environ.get('TWELVE_DATA_API_KEY') or os.environ.get('API_KEY')
    if not key and (REPO / '.env').exists():
        for line in (REPO / '.env').read_text().splitlines():
            if line.startswith('API_KEY='):
                key = line.split('=', 1)[1].strip().strip('\"\'')
    if not key:
        raise RuntimeError('Set TWELVE_DATA_API_KEY or the repo .env API_KEY')
    return key


def atomic_write(path, content):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_bytes(content)
    temporary.replace(path)


def read_prices(path):
    if not path.exists():
        return {}
    rows = list(csv.DictReader(io.StringIO(path.read_text())))
    values = {}
    for row in rows:
        day, value = date.fromisoformat(row['date']).isoformat(), float(row['close'])
        if day in values or not math.isfinite(value) or value <= 0:
            raise ValueError(f'Invalid cached price in {path.name}')
        values[day] = value
    return dict(sorted(values.items()))


def csv_bytes(values):
    return ('date,close\n' + ''.join(f'{day},{value:.12g}\n' for day, value in sorted(values.items()))).encode()


def merge_adjusted(old, new):
    """Rebase cached history at overlap before appending newly adjusted prices."""
    overlap = sorted(old.keys() & new.keys())
    if old and new and not overlap:
        raise ValueError('No overlapping price to align adjustment scales; cache left unchanged')
    if not old:
        return dict(sorted(new.items()))
    ratios = sorted(new[day] / old[day] for day in overlap)
    factor = ratios[len(ratios) // 2]
    if any(abs(ratio / factor - 1) > 0.0001 for ratio in ratios):
        raise ValueError('Nonuniform overlap revision; use --refresh to replace this snapshot safely')
    merged = {day: value * factor for day, value in old.items()}
    merged.update(new)
    return dict(sorted(merged.items()))


def fetch_plan(old, meta, symbol, start, end, refresh=False):
    first_needed = max(start, INCEPTION[symbol])
    if not old or refresh:
        return [('history', first_needed, end)]
    plan = []
    first, last = min(old), max(old)
    if first > first_needed and not meta.get('history_complete'):
        overlap_end = min(end, (date.fromisoformat(first) + timedelta(days=10)).isoformat())
        plan.append(('backfill', first_needed, overlap_end))
    checked_end = meta.get('checked_end', last)
    if end > checked_end:
        overlap_start = max(first_needed, (date.fromisoformat(last) - timedelta(days=10)).isoformat())
        plan.append(('tail', overlap_start, end))
    return plan


class QuotaBudget:
    def __init__(self, maximum):
        self.maximum, self.used = maximum, 0

    def consume(self):
        if self.used >= self.maximum:
            raise RuntimeError(f'Twelve Data call budget reached ({self.maximum}); saved pages can be reused on the next run')
        self.used += 1


def download_range(symbol, adjust, start, end, budget, fetch=request, key=None):
    budget.consume()
    params = {'apikey': key if key is not None else api_key(), 'symbol': symbol, 'interval': '1day',
              'outputsize': 5000, 'adjust': adjust, 'start_date': start, 'end_date': end}
    payload = json.loads(fetch(SOURCE + '?' + urlencode(params)))
    if payload.get('status') != 'ok' or not payload.get('values'):
        code = payload.get('code')
        # Empty/no-data market sessions are negative-cached; authentication/429 errors are not.
        if code == 400 and 'no data' in str(payload.get('message', '')).lower():
            return {}, True
        raise RuntimeError(f'{symbol} {adjust}: provider error code {code}; stopping without retries')
    values = {}
    for row in payload['values']:
        day, value = date.fromisoformat(row['datetime']).isoformat(), float(row['close'])
        if not start <= day <= end or not math.isfinite(value) or value <= 0 or day in values:
            raise ValueError(f'{symbol}: invalid daily response')
        values[day] = value
    return dict(sorted(values.items())), len(values) < 5000


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--start', default='2010-02-11', help='Required ETF history start; --start 1985-01-01 enables older ETF backfill')
    parser.add_argument('--end', default='2026-10-13', help='Inclusive last completed US session')
    parser.add_argument('--data-dir', type=Path, default=ROOT / 'data')
    parser.add_argument('--refresh', action='store_true', help='Explicitly discard cached coverage and fetch the whole requested range')
    parser.add_argument('--offline', action='store_true', help='Only inspect/adopt local caches; make no network requests')
    parser.add_argument('--plan', action='store_true', help='Show missing ranges without accessing the network')
    parser.add_argument('--max-api-calls', type=int, default=4, help='Hard ceiling on Twelve Data HTTP requests in this run')
    parser.add_argument('--symbols', nargs='+', choices=tuple(INCEPTION), default=list(INCEPTION))
    parser.add_argument('--fred-series', nargs='+', default=['NASDAQ100', 'DTB3'], choices=['NASDAQ100', 'DTB3', 'DGS10', 'DGS20', 'DGS30'])
    parser.add_argument('--refresh-public', action='store_true', help='Refresh free FRED/author files, independently of paid ETF calls')
    args = parser.parse_args()
    date.fromisoformat(args.start)
    date.fromisoformat(args.end)
    if args.start > args.end or args.max_api_calls < 0:
        parser.error('Invalid date window or request budget')
    data = args.data_dir
    data.mkdir(parents=True, exist_ok=True)
    manifest_path = data / 'manifest.json'
    metadata = json.loads(manifest_path.read_text()) if manifest_path.exists() else {'files': {}}
    metadata['provider'] = 'Twelve Data / FRED'
    metadata.setdefault('files', {})
    budget = QuotaBudget(args.max_api_calls)

    def save_manifest():
        atomic_write(manifest_path, json.dumps(metadata, indent=2, ensure_ascii=False).encode())

    def record(name, content, source, **details):
        previous = metadata['files'].get(name, {})
        metadata['files'][name] = {**previous, 'source': source, 'sha256': hashlib.sha256(content).hexdigest(), **details}
        save_manifest()

    try:
        for symbol, adjust, filename in SPECS:
            if symbol not in args.symbols:
                continue
            path = data / filename
            old = read_prices(path)
            meta = metadata['files'].get(filename, {})
            if meta.get('adjust', adjust) != adjust or meta.get('symbol', symbol) != symbol:
                raise ValueError(f'{filename}: cache identity mismatch')
            if old and not meta.get('checked_end'):
                # Migrate the already-queried snapshots from the first local backtest.
                meta = {**meta, 'checked_end': metadata.get('requested_end', max(old))}
            plan = fetch_plan(old, meta, symbol, args.start, args.end, args.refresh)
            print(f'{symbol} adjust={adjust}: ' + ('cached' if not plan else '; '.join(f'{kind} {begin} → {finish}' for kind, begin, finish in plan)), flush=True)
            if args.plan:
                continue
            if args.offline and plan:
                print('  offline: missing range kept as-is', flush=True)
                plan = []
            for kind, begin, finish in plan:
                cursor = finish
                first_page = True
                while cursor >= begin:
                    page, complete = download_range(symbol, adjust, begin, cursor, budget)
                    base = {} if args.refresh and kind == 'history' and first_page else old
                    old = merge_adjusted(base, page) if page else base
                    first_page = False
                    if old:
                        content = csv_bytes(old)
                        atomic_write(path, content)
                        details = {'symbol': symbol, 'adjust': adjust, 'bars': len(old), 'first': min(old), 'last': max(old),
                                   'last_fetched_at_utc': datetime.now(timezone.utc).isoformat()}
                        if kind in ('tail', 'history'):
                            details['checked_end'] = finish
                        if kind in ('backfill', 'history') and complete:
                            details['history_complete'] = begin <= INCEPTION[symbol]
                        record(filename, content, SOURCE, **details)
                    elif not page:
                        raise RuntimeError(f'{symbol}: no initial history available')
                    if complete or kind == 'tail':
                        break
                    cursor = (date.fromisoformat(min(page)) + timedelta(days=10)).isoformat()
                    if cursor >= finish:
                        raise RuntimeError('Pagination failed to move backward')
                    finish = cursor
            if path.exists() and not plan:
                record(filename, path.read_bytes(), SOURCE, symbol=symbol, adjust=adjust, bars=len(old),
                       first=min(old), last=max(old), checked_end=meta.get('checked_end', max(old)))
        if args.plan:
            print(f'Plan only; API calls: 0. Run ceiling: {args.max_api_calls}.')
            return
        for series in args.fred_series:
            filename = f'{series}.csv'
            path = data / filename
            url = f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}'
            if not path.exists() or args.refresh_public:
                if args.offline:
                    print(f'FRED {series}: unavailable offline', flush=True)
                    continue
                atomic_write(path, request(url))
            record(filename, path.read_bytes(), url)
        for name in ('data.json', 'index.html', 'whitepaper.html'):
            filename = 'author_data.json' if name == 'data.json' else name
            path = data / filename
            url = f'https://willperryyy.github.io/tqqq-gate/{name}'
            if not path.exists() or args.refresh_public:
                if args.offline:
                    continue
                atomic_write(path, request(url))
            record(filename, path.read_bytes(), url)
        metadata['last_run_utc'] = datetime.now(timezone.utc).isoformat()
        metadata['last_run_twelve_data_calls'] = budget.used
        save_manifest()
        print(f'Twelve Data API calls: {budget.used}/{budget.maximum}; cache saved locally.', flush=True)
    except Exception as error:
        metadata['last_run_twelve_data_calls'] = budget.used
        metadata['last_error'] = str(error)
        save_manifest()
        raise SystemExit(str(error)) from None


if __name__ == '__main__':
    main()
