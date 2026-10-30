"""Export the research console's inputs: resampling dataset, Python run archive, and the TS parity fixture."""
import argparse
import datetime
import json
import subprocess
from dataclasses import asdict
from pathlib import Path

import numpy as np
import pandas as pd

from backtest import Parameters, metrics, portfolio, signals, sma_band_signals
from bootstrap import permuted_blocks, run_world
from bootstrap_params import SCHEMES, VARIANTS, days_frame, evaluate
from long_history import build_history
from matched import matched
from three_gate_params import SWEEPS
from weights import weighted_portfolio

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[1]
LAG, COST = 1, 2.5
# bootstrap.py's START for lag 1; the TS engine evaluates from row 251 + executionLag.
EVAL_START = 251 + LAG
BOOTSTRAP_SEED, PARAMS_SEED = 20261029, 20261030
PARITY_SEED, PARITY_BLOCK = 12345, 63


def read_csv(path, **kw):
    # pandas' default parser can miss the last bit; the cross-checks below compare exactly.
    return pd.read_csv(path, float_precision="round_trip", **kw)


def camel(name):
    head, *rest = name.split("_")
    return head + "".join(word.title() for word in rest)


def gate_spec(rule_id, params):
    return {"kind": "gate", "id": rule_id, "params": {camel(k): v for k, v in asdict(params).items()}}


HOLDS = [{"kind": "hold", "id": "tqqq_hold", "asset": "tqqq"}, {"kind": "hold", "id": "qqq_hold", "asset": "qqq"}]
BOOT_RULES = [gate_spec("three_gate", Parameters()),
              {"kind": "sma", "id": "ndx_sma200_4pct", "basis": "ndx", "window": 200, "enter": 0.04, "exit": 0.04},
              {"kind": "fixed", "id": "fixed_50pct", "weight": 0.5, "band": 0.10}, *HOLDS]
PARAM_RULES = [*(gate_spec(name, p) for name, p in VARIANTS.items()),
               {"kind": "sma", "id": "sma200_+4/-3_qqq", "basis": "qqq", "window": 200, "enter": 0.04, "exit": 0.03},
               {"kind": "sma", "id": "sma200_+4/-3_spy", "basis": "spy", "window": 200, "enter": 0.04, "exit": 0.03}, *HOLDS]
STRIP_RULES = ("three_gate", "three_gate_default", "ndx_sma200_4pct", "sma200_+4/-3_qqq", "sma200_+4/-3_spy", "tqqq_hold", "qqq_hold")


def round_returns(days, digits=10):
    return days.map(lambda v: float(f"{v:.{digits}g}"))


def evaluate_rules(days, idx, rules, lag, cost):
    """Generic RuleSpec runner on bootstrap.run_world's timing; the parity reference for the TS engine."""
    sample = pd.DataFrame(days.to_numpy()[idx], index=days.index, columns=days.columns)
    start = 251 + lag
    ix = sample.index[start:]
    risk, cash = sample.tqqq.loc[ix], sample.cash.loc[ix]
    one = pd.Series(1, index=ix)
    out = {}
    for rule in rules:
        if rule["kind"] in ("gate", "sma"):
            if rule["kind"] == "gate":
                p = Parameters(**{k: rule["params"][camel(k)] for k in asdict(Parameters())})
                frame = signals((1 + sample.ndx).cumprod(), p)
            else:
                frame = sma_band_signals((1 + sample[rule["basis"]]).cumprod(), rule["window"], rule["enter"], exit_band=rule["exit"])
            if not frame.valid.iloc[start - lag]:
                raise ValueError(f"{rule['id']}: indicators not warmed up before the evaluation start")
            result = portfolio(risk, cash, frame.signal.shift(lag).fillna(0).loc[ix], cost)
        elif rule["kind"] == "fixed":
            result = weighted_portfolio(risk, cash, one * rule["weight"], rule["band"], cost)
        else:
            result = portfolio(sample[rule["asset"]].loc[ix], cash, one, cost)
        m = metrics(result, cash)
        out[rule["id"]] = {"cagr": m["cagr"], "maxDrawdown": m["max_drawdown"], "sharpe": m["sharpe"],
                           "exposure": 0.0 if rule.get("asset") == "qqq" else m["risk_exposure"],
                           "switches": m["switches"], "switchesPerYear": m["switches_per_year"]}
    return out


def check_against_scripts(days):
    """The generic runner must reproduce bootstrap.py and bootstrap_params.py on the same rows, bit for bit."""
    n = len(days)
    for idx in (np.arange(n), permuted_blocks(n, 250, np.random.default_rng(7))):
        ours = evaluate_rules(days, idx, BOOT_RULES, LAG, COST)
        for rule, m in run_world(days.drop(columns="spy"), idx, EVAL_START, LAG, COST).items():
            assert (ours[rule]["cagr"], ours[rule]["maxDrawdown"], ours[rule]["sharpe"]) == (m["cagr"], m["max_drawdown"], m["sharpe"]), rule
        ours = evaluate_rules(days, idx, PARAM_RULES, LAG, COST)
        sample = pd.DataFrame(days.to_numpy()[idx], index=days.index, columns=days.columns)
        for rule, m in evaluate(sample).items():
            assert (ours[rule]["cagr"], ours[rule]["maxDrawdown"], ours[rule]["sharpe"]) == (m["cagr"], m["max_drawdown"], m["sharpe"]), rule


def dataset_json(history, days):
    real = history.tqqq_source.loc[days.index].eq("actual").to_numpy()
    return {"dates": [d.strftime("%Y-%m-%d") for d in days.index], **{c: days[c].tolist() for c in ("ndx", "tqqq", "qqq", "spy", "cash")},
            "evalStart": EVAL_START, "realTqqqFrom": int(np.argmax(real))}


def parity_json(days):
    n = len(days)
    idx = permuted_blocks(n, PARITY_BLOCK, np.random.default_rng(PARITY_SEED))
    rules = BOOT_RULES + [r for r in PARAM_RULES if r["id"] not in {b["id"] for b in BOOT_RULES}]
    identity = np.arange(n)
    pair = [r for r in rules if r["id"] in ("three_gate_default", "sma200_+4/-3_spy")]
    cases = [{"name": "actual", "lag": LAG, "cost": COST, "permuted": False, "metrics": evaluate_rules(days, identity, rules, LAG, COST)},
             {"name": f"permute{PARITY_BLOCK}", "lag": LAG, "cost": COST, "permuted": True, "metrics": evaluate_rules(days, idx, rules, LAG, COST)}]
    cases += [{"name": f"actual_lag{lag}", "lag": lag, "cost": COST, "permuted": False, "metrics": evaluate_rules(days, identity, pair, lag, COST)}
              for lag in (0, 2)]
    return {"source": "backtests/tqqq_gate/export_console.py on public/research/dataset.json",
            "permutation": {"block": PARITY_BLOCK, "seed": PARITY_SEED, "idx": idx.tolist()}, "rules": rules, "cases": cases}


def window_metrics(row, prefix, zero_exposure=False):
    return {"cagr": row[f"{prefix}cagr"], "maxDrawdown": row[f"{prefix}mdd" if f"{prefix}mdd" in row else f"{prefix}max_drawdown"],
            "sharpe": row[f"{prefix}sharpe"], "exposure": 0.0 if zero_exposure else row[f"{prefix}exposure" if f"{prefix}exposure" in row else f"{prefix}risk_exposure"],
            "switchesPerYear": row[f"{prefix}switches_per_year"]}


def quantiles(values):
    q = np.quantile(np.asarray(values, float), [0.05, 0.25, 0.5, 0.75, 0.95])
    return dict(zip(("p05", "p25", "p50", "p75", "p95"), map(float, q)))


def screen_json(results):
    table = read_csv(results / "rule_screen" / "candidates.csv")
    finalists = read_csv(results / "rule_screen" / "finalists.csv")
    overfit = json.loads((results / "rule_screen" / "overfit.json").read_text())
    trials = table[table.trial]
    sharpe = trials.pivot(index="label", columns="window", values="sharpe")
    family = trials.drop_duplicates("label").set_index("label").family
    oos_rank = sharpe.oos.rank(ascending=False)
    is_rank = sharpe["is"].rank(ascending=False)
    post_hoc = set(overfit["post_hoc_families"])
    dsr = [{"label": overfit["overall_is_winner"]["label"], "trials": int(n), "dsr": v}
           for n, v in overfit["overall_is_winner_dsr_by_assumed_trials"].items()]
    # trials == 1 is the single-test PSR on the real-TQQQ out-of-sample window.
    for key in ("overall_is_winner", "fresh_is_winner_excluding_post_hoc"):
        pick = overfit[key]
        if pick["label"] != overfit["overall_is_winner"]["label"]:
            dsr.append({"label": pick["label"], "trials": pick["dsr_in_sample"]["n_trials"], "dsr": pick["dsr_in_sample"]["dsr"]})
        dsr.append({"label": pick["label"], "trials": 1, "dsr": pick["psr_out_of_sample_single_trial"]["dsr"]})
    rows = []
    for label, g in finalists.groupby("label", sort=False):
        by = g.set_index("window")
        zero = label.startswith("Index")
        rows.append({"label": label, "family": by.family.iloc[0], "selectedAs": by.selected_as.iloc[0],
                     "oosRank": int(oos_rank[label]) if label in oos_rank else None,
                     **{w: window_metrics(by.loc[w], "", zero) for w in ("is", "oos", "full")}})
    families = [{"family": f, "trials": int((family == f).sum()),
                 "isSharpe": [float(sharpe["is"][family == f].min()), float(sharpe["is"][family == f].max())],
                 "oosSharpe": [float(sharpe.oos[family == f].min()), float(sharpe.oos[family == f].max())],
                 "isRankMean": float(is_rank[family == f].mean()), "oosRankMean": float(oos_rank[family == f].mean())}
                for f in family.unique()]
    return {"nTrials": overfit["n_trials"], "spearman": overfit["is_oos_sharpe_spearman"], "pbo": overfit["pbo_cscv_full_window"]["pbo"],
            "pboExcludingPostHoc": overfit["pbo_cscv_full_window_excluding_post_hoc"]["pbo"], "dsr": dsr, "finalists": rows, "families": families,
            "trials": [{"label": l, "family": family[l], "postHoc": family[l] in post_hoc, "isSharpe": float(sharpe.loc[l, "is"]),
                        "oosSharpe": float(sharpe.loc[l, "oos"])} for l in family.index]}


def params_json(results):
    base = results / "three_gate_params"
    baselines = read_csv(base / "baselines.csv").set_index("rule")
    sweep = read_csv(base / "one_at_a_time.csv")
    grid = read_csv(base / "grid.csv")
    summary = read_csv(base / "grid_summary.csv", index_col=0)
    facts = read_csv(base / "grid_facts.csv", index_col=0).value
    segs = ("pre2010", "post2010", "full")
    seg = lambda row, zero=False: {s: window_metrics(row, f"{s}_", zero) for s in segs}
    return {"baselines": [{"rule": "tqqq_hold", "segments": seg(baselines.loc["TQQQ buy & hold"])},
                          {"rule": "qqq_hold", "segments": seg(baselines.loc["QQQ / index buy & hold"], True)}],
            "sweep": [{"axis": camel(r.axis), "value": float(r.value), "isDefault": bool(r.is_default), "segments": seg(r)} for _, r in sweep.iterrows()],
            "grid": {"size": len(grid),
                     "segments": {s: {"cagr": quantiles(grid[f"{s}_cagr"]), "maxDrawdown": quantiles(grid[f"{s}_mdd"]),
                                      "shareCagrAboveTqqq": float(summary.loc["share_cagr_above_tqqq_hold", s]),
                                      "shareDrawdownShallowerThanTqqq": float(summary.loc["share_mdd_shallower_than_tqqq_hold", s]),
                                      "shareSharpeAboveTqqq": float(summary.loc["share_sharpe_above_tqqq_hold", s])} for s in segs},
                     "rankCorrelation": {"cagr": float(facts["pre_post_rank_corr_cagr"]), "sharpe": float(facts["pre_post_rank_corr_sharpe"]),
                                         "maxDrawdown": float(facts["pre_post_rank_corr_mdd"])},
                     "defaultSharpeRank": {s: int(facts[f"default_sharpe_rank_{s}"]) for s in segs}}}


def run_json(run_id, script, method, block, seed, wide, actual):
    """wide: (world x rule) frames per metric; actual: rule -> WindowMetrics on the historical order."""
    rules = list(wide["cagr"].columns)
    summary = []
    for rule in rules:
        c, d, s = wide["cagr"][rule], wide["max_drawdown"][rule], wide["sharpe"][rule]
        summary.append({"ruleId": rule, "worlds": len(c), "cagr": quantiles(c), "maxDrawdown": quantiles(d), "sharpe": quantiles(s),
                        "pDrawdownWorse70": float((d < -0.70).mean()),
                        "actualDrawdownPercentile": float((d < actual[rule]["maxDrawdown"]).mean()),
                        "actualCagrPercentile": float((c < actual[rule]["cagr"]).mean())})
    keys = [r for r in rules if r in STRIP_RULES]
    strips = [{"ruleId": r, "cagr": wide["cagr"][r].round(4).tolist(), "maxDrawdown": wide["max_drawdown"][r].round(4).tolist()} for r in keys]
    paired = {a: {b: {"cagr": float((wide["cagr"][a] > wide["cagr"][b]).mean()),
                      "maxDrawdown": float((wide["max_drawdown"][a] > wide["max_drawdown"][b]).mean()),
                      "sharpe": float((wide["sharpe"][a] > wide["sharpe"][b]).mean())} for b in keys if b != a} for a in keys}
    return {"id": run_id, "script": script, "method": method, "block": int(block), "worlds": len(wide["cagr"]), "seed": seed,
            "summary": summary, "actual": {r: actual[r] for r in rules}, "strips": strips, "paired": paired}


def actual_metrics(days, rules, script_actual):
    """Full WindowMetrics on the historical order; the scripts' CSVs lack exposure for some runs, so rerun and cross-check."""
    ours = evaluate_rules(days, np.arange(len(days)), rules, LAG, COST)
    for rule, m in ours.items():
        row = script_actual.loc[rule]
        assert (m["cagr"], m["maxDrawdown"], m["sharpe"]) == (row.cagr, row.max_drawdown, row.sharpe), rule
    return {r: {k: m[k] for k in ("cagr", "maxDrawdown", "sharpe", "exposure", "switchesPerYear")} for r, m in ours.items()}


def worlds_json(results, days):
    runs = []
    boot = read_csv(results / "bootstrap" / "worlds.csv")
    actual = actual_metrics(days, BOOT_RULES, boot[boot.method == "actual"].set_index("rule"))
    for (method, block), g in boot[boot.method != "actual"].groupby(["method", "block"], sort=False):
        wide = {m: g.pivot(index="world", columns="rule", values=m)[[r["id"] for r in BOOT_RULES]] for m in ("cagr", "max_drawdown", "sharpe")}
        runs.append(run_json(f"bootstrap-{method}-{block}", "bootstrap.py", method, block, BOOTSTRAP_SEED, wide, actual))
    params = read_csv(results / "bootstrap_params" / "worlds.csv")
    actual = actual_metrics(days, PARAM_RULES, params[params.scheme == "actual"].set_index("rule"))
    for scheme, g in params[params.scheme != "actual"].groupby("scheme", sort=False):
        wide = {m: g.pivot(index="world", columns="rule", values=m)[[r["id"] for r in PARAM_RULES]] for m in ("cagr", "max_drawdown", "sharpe")}
        method = scheme.split("_")[0]
        runs.append(run_json(f"params-{scheme}", "bootstrap_params.py", method, SCHEMES[scheme][1], PARAMS_SEED, wide, actual))
    seen = set()
    rules = [r for r in BOOT_RULES + PARAM_RULES if not (r["id"] in seen or seen.add(r["id"]))]
    return {"runs": runs, "rules": rules}


def write(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, allow_nan=False, separators=(",", ":")), encoding="utf-8")
    print(f"{path.relative_to(REPO)}: {path.stat().st_size / 1024:.1f} KB")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=ROOT / "data" / "yahoo")
    parser.add_argument("--results", type=Path, default=ROOT / "results")
    parser.add_argument("--output", type=Path, default=REPO / "public" / "research")
    parser.add_argument("--fixture", type=Path, default=REPO / "src" / "research" / "engine" / "__fixtures__" / "parity.json")
    parser.add_argument("--end", default="2026-10-13")
    args = parser.parse_args()
    history, _, _ = build_history(args.data_dir, args.end)
    days = days_frame(history, args.data_dir)
    check_against_scripts(days)
    rounded = round_returns(days)
    parity = parity_json(rounded)
    drift = max(abs(parity["cases"][0]["metrics"][r][k] - m[k]) for r, m in evaluate_rules(days, np.arange(len(days)), parity["rules"], LAG, COST).items()
                for k in ("cagr", "maxDrawdown", "sharpe"))
    print(f"10-significant-digit rounding moves actual-order metrics by at most {drift:.2e}")
    index = history.index
    archive = {"generated": {"date": datetime.date.today().isoformat(),
                             "commit": subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO, capture_output=True, text=True, check=True).stdout.strip(),
                             "start": "1986-10-01", "split": "2010-02-11", "end": index[-1].strftime("%Y-%m-%d")},
               "screen": screen_json(args.results), "params": params_json(args.results), "matched": matched(history, args.data_dir, LAG, COST),
               "worlds": worlds_json(args.results, days)}
    sp = archive["matched"]["sp500"]
    print("RUN 03 full: S&P author {cagr:.3f}/{maxDrawdown:.3f}/SR{sharpe:.2f}".format(**sp["authorParams"]["full"]),
          "| grid median {cagrMedian:.3f}/{drawdownMedian:.3f} worst {drawdownWorst:.3f}".format(**sp["grid"]["full"]),
          "| 3x hold {cagr:.3f}/{maxDrawdown:.3f}".format(**sp["hold3x"]["full"]), "| 1x hold {cagr:.3f}/{maxDrawdown:.3f}".format(**sp["hold1x"]["full"]))
    write(args.output / "dataset.json", dataset_json(history, rounded))
    write(args.output / "archive.json", archive)
    write(args.fixture, parity)


if __name__ == "__main__":
    main()
