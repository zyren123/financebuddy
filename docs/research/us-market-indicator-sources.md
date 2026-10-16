# US market indicator sources

Verified 2026-10-16. This records the public-source investigation for the market overview. Values below are probe observations, not constants to ship as live data.

## Selected behavior

The user requested free public data and explicit missing values. Use actual S&P 500 and Nasdaq-100 indices, with no SPY/QQQ substitution.

| Metric | Selected source | Behavior |
| --- | --- | --- |
| S&P 500 RSI(6) / 52-week drawdown | Yahoo Finance chart, `^GSPC` | Use completed daily close/high observations; calculate indicators in the frontend. |
| Nasdaq-100 RSI(6) / 52-week drawdown | Yahoo Finance chart, `^NDX` | Same completed-session handling. |
| VIX | Yahoo Finance chart, `^VIX` | Preserve the source observation date. |
| S&P 500 and Nasdaq-100 PE-TTM | Danjuan/Xueqiu Fund index valuations | Use `SP500` and `NDX`; display valuation date and provider. |
| Ten-year PE percentile | Danjuan provider percentile | Use the published percentile, not a percentile recomputed from the sampled chart history. |
| Forward PE, next twelve months | No selected public provider | Removed from the interface at the user's request on 2026-10-16; findings below are retained as research history. |
| CNN Fear & Greed | CNN official public graphdata endpoint | Attempt official data. On failed access, show unavailable; no automatic mirror fallback. |

Every metric needs its own observation date. Successful fetch time does not make the underlying reading current. Preserve cached successful values as dated/stale if the application uses a cache, and do not turn missing values into zero.

## Yahoo index prices

The implementation investigation verified the public chart endpoint for `^GSPC`, `^NDX`, and `^VIX`, for example [Yahoo S&P 500 daily chart](https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=1mo). It returns `chart.result[0].timestamp` and parallel `indicators.quote[0].close` arrays; `meta` includes market metadata. Use valid completed daily OHLC observations, not an unfinished intraday last price. Symbols refer to the indices themselves. This endpoint is public but is not a guaranteed application API contract; report an individual provider failure without blocking unrelated indicators.

## Danjuan PE-TTM and percentile

[Danjuan's own explanation](https://danjuanfunds.com/article/337.html) identifies its PE field as PE-TTM, its principal upstream source as Choice terminal, and its percentile reference window as the latest ten years, using all available history when shorter. It gives 2012-01-04 as the initial S&P 500/Nasdaq-100 date. The publisher also notes that supplier differences can change values and does not guarantee complete accuracy. These are provider valuations, not an assertion of an official S&P/Nasdaq methodology.

The public [index valuation endpoint](https://danjuanfunds.com/djapi/index_eva/dj), used for the [valuation center](https://danjuanfunds.com/djmodule/value-center), returned HTTP 200, `result_code: 0`, and 63/63 items. Normal `User-Agent: Mozilla/5.0` worked; a bare Python urllib request returned 403. No account or credential was used.

Relevant observed JSON shape:

```json
{
  "result_code": 0,
  "data": {
    "items": [
      {
        "index_code": "SP500",
        "name": "标普500",
        "pe": 25.0982,
        "pe_percentile": 0.5632,
        "ts": 1791993600000,
        "updated_at": 1792114320234,
        "date": "10-15"
      },
      {
        "index_code": "NDX",
        "name": "纳指100",
        "pe": 30.0447,
        "pe_percentile": 0.4508,
        "ts": 1791993600000,
        "updated_at": 1792114320404,
        "date": "10-15"
      }
    ],
    "total_items": 63
  }
}
```

Find rows by exact `index_code`, not name or row position. `pe_percentile` is a fraction: `0.5632` becomes `56.32%`; zero is valid. Treat a non-finite or nonpositive PE as missing. `ts` is milliseconds representing the valuation date at midnight Asia/Shanghai: the sample is **2026-10-15** in that zone and **2026-10-14 16:00 UTC**. Formatting it in UTC would shift the date. `updated_at` is a publication timestamp; `date` omits the year and is unsuitable as the canonical date. Suggested label: “PE-TTM · 蛋卷基金” and “近10年分位 · 数据源口径”.

### Sampled history and the percentile distinction

Public chart histories were also readable:

- [SP500 PE history](https://danjuanfunds.com/djapi/index_eva/pe_history/SP500?day=all&limit=10000): `data.index_eva_pe_growths`, 516 `{pe, ts}` observations, 2016-10-17 through 2026-10-15 in Asia/Shanghai.
- [NDX PE history](https://danjuanfunds.com/djapi/index_eva/pe_history/NDX?day=all&limit=10000): the same shape, 514 observations over the same dates.

Both exports had median spacing seven calendar days and a maximum gap of 15 days. `limit=10000` did not produce daily observations. The latest values matched the current endpoint. A simple empirical percentile over these sampled exports was approximately 54.26% for SP500 and 43.39% for NDX, versus the provider's 56.32% and 45.08%. Therefore the sampled history does not reproduce the published percentile. The exact current percentile implementation is not exposed; use the provider field, cite its ten-year description, and do not present a subsample calculation as the same statistic.

## CNN Fear & Greed availability

The [official CNN graphdata endpoint](https://production.dataviz.cnn.io/index/fearandgreed/graphdata) initially returned HTTP **418** in the Python shell probe. The [CNN index page](https://www.cnn.com/markets/fear-and-greed) was also not readable by the web fetcher. Subsequent application verification using Node fetch returned HTTP **200** with `fear_and_greed.score` and an ISO `fear_and_greed.timestamp`; both fields were validated. Availability can differ by request environment, so the implementation attempts the official endpoint and handles failure independently. No sample score is shipped as a constant.

Keep the official source link and show a clear unavailable state when access fails. There is no selected third-party mirror, independently reconstructed score, authentication workaround, or crypto Fear & Greed substitute.

The user subsequently supplied a trusted local HTTP proxy at `127.0.0.1:10808`. Starting Node with that proxy and `NODE_USE_ENV_PROXY=1` resolved Yahoo's local HTTP 403. Application verification then returned HTTP 200 for all five selected feeds; prices/valuations retained their 2026-10-15 date and CNN its distinct 2026-10-16 publication date. The proxy setting is local runtime configuration, not a hardcoded application dependency.

## Forward PE investigation and rejected substitutions

No automated forward-PE source was selected under the free-source decision. These findings explain the missing state and possible future integration work:

### Yahoo / yfinance runtime check

On 2026-10-16, the user's proposed `yf.Ticker(symbol).info.get("forwardPE")` was run with yfinance 1.2.0 through the supplied proxy. The info responses contained 73–186 fields, so missing values here were not inferred from an empty or failed request.

| Ticker | `forwardPE` | `trailingPE` |
| --- | --- | --- |
| SPY | Field absent / `None` | 24.503487 |
| QQQ | Field absent / `None` | 27.87565 |
| ^GSPC | Field absent / `None` | Field absent / `None` |
| ^NDX | Field absent / `None` | Field absent / `None` |
| AAPL, request control | 35.707386 | 39.22018 |

The syntax is valid, but the observed ETF/index responses did not supply forward PE or forward EPS. [yfinance's quote implementation](https://github.com/ranaroussi/yfinance/blob/main/yfinance/scrapers/quote.py) merges and flattens Yahoo quote responses; it does not construct a missing forward PE. These observations are a dated availability check, not fixed application values or a claim that the fields can never become available. Production behavior was not changed by this check.

### Other investigated publishers

| Publisher | Verified coverage | Why not selected |
| --- | --- | --- |
| [History of Market, S&P 500](https://historyofmarket.com/sp500/forward-pe/) and [Nasdaq-100](https://historyofmarket.com/nasdaq/ndx-forward-pe/) | Publisher advertises next-twelve-month consensus series at `/api/sp500/forward-pe.json` and `/api/ndx/forward-pe.json`; NDX weekly history starts April 2001 with a disclosed 2005–2006 gap. | Backend GET returned 403. Pages mixed headline dates/values with older table rows, making freshness ambiguous. [Terms](https://historyofmarket.com/license/) explicitly identify terminal forward PE as third-party, display-only data that may not be redistributed. |
| [Siblis free API](https://siblisresearch.com/global-valuations-database/api/) | [NDX forward endpoint](https://siblisresearch.com/api/v1/NDX/pe-forward) returned eight historical snapshots, latest 2026-06-30 = 25.17. The response explicitly labels the free tier as historical month-end snapshots. | Unsuitable as a current reading or ten-year percentile history. The `USA` index is the publisher's U.S. Large Cap universe and must not be renamed S&P 500. |
| [Siblis Nasdaq-100 page](https://siblisresearch.com/data/nasdaq-100-pe-ratio/) | Public monthly page showed NDX forward PE 23.26 at 2026-09-30 and defines forward PE as consensus next-twelve-month earnings. | No recurring page scraper selected. [Terms](https://siblisresearch.com/terms-of-use/) permit attributed quotation but exclude systematic scraping and republishing a feed; application redistribution requires a separate licence. |
| [FactSet Earnings Insight latest report](https://insight.factset.com/earningsinsight) | Stable URL returned HTTP 200 and redirected to the official [2026-10-09 PDF](https://advantage.factset.com/hubfs/Website/Resources%20Section/Research%20Desk/Earnings%20Insight/EarningsInsight_100926.pdf). Page 1 reports actual S&P 500 forward 12-month PE = 19.1. | Potential future dated weekly report ingestion, requiring PDF extraction and a distinct refresh/provenance policy. Not an API and not selected for the initial implementation. Do not silently install a fixed report value as live data. |

The Siblis free API shape is `{ticker, index_name, ratio, data: [{"trading_day (EOD)": "YYYY-MM-DD", value}], _meta}`. Its `frequency: "daily"` describes the commercial series; the free response's `_meta.note` and actual sample dates determine usable coverage.

Different PE publishers use different earnings adjustments and aggregation methods. Never combine one publisher's current TTM with another's historical distribution to claim a consistent percentile, and never relabel an ETF or a different large-cap universe as the requested index.
