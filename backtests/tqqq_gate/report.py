"""Small offline HTML report; no CDN, network request, or browser dependencies."""
import html
import math

COLORS = ["#12745b", "#b86624", "#785bb1", "#537ba7", "#b23e63", "#216572"]


def display_name(name):
    return name.replace("SPYSIM TR SMA200 +/-4%", "SPYSIM 总收益近似 · SMA200 ±4%").replace("SP500 Price SMA200 +/-4%", "标普价格指数 · SMA200 ±4%")


def plot(frame, title, logarithmic=False):
    width, height = 1040, 340
    left, top, right, bottom = 72, 22, 25, 45
    x0, y0 = frame.index[0], frame.index[-1]
    values = frame.apply(lambda col: col.map(math.log10)) if logarithmic else frame * 100
    minimum, maximum = float(values.min().min()), float(values.max().max())
    if not logarithmic:
        maximum = max(0, maximum)
    extent = maximum - minimum or 1
    minimum -= extent * 0.04
    maximum += extent * 0.04

    def x(date):
        return left + (date - x0).days / (y0 - x0).days * (width - left - right)

    def y(value):
        return top + (maximum - value) / (maximum - minimum) * (height - top - bottom)

    parts = [f'<svg viewBox="0 0 {width} {height}" role="img" aria-label="{html.escape(title)}">']
    for i in range(5):
        value = minimum + (maximum - minimum) * i / 4
        label = f"${10 ** value:,.1f}" if logarithmic else f"{value:.0f}%"
        yy = y(value)
        parts.append(f'<line x1="{left}" x2="{width-right}" y1="{yy:.1f}" y2="{yy:.1f}" stroke="#e2e5e2"/><text x="{left-10}" y="{yy+4:.1f}" text-anchor="end">{label}</text>')
    for year in range(x0.year, y0.year + 1):
        date = frame.index[frame.index.year == year][0]
        if year % 2 == 0 or year == x0.year:
            parts.append(f'<text x="{x(date):.1f}" y="{height-15}" text-anchor="middle">{year}</text>')
    for n, (name, col) in enumerate(values.items()):
        points = " ".join(f"{x(date):.1f},{y(value):.1f}" for date, value in col.items())
        parts.append(f'<polyline points="{points}" fill="none" stroke="{COLORS[n]}" stroke-width="1.5"><title>{html.escape(display_name(name))}</title></polyline>')
    parts.append('</svg>')
    legend = ''.join(f'<span><i style="background:{COLORS[i]}"></i>{html.escape(display_name(name))}</span>' for i, name in enumerate(values.columns))
    return f'<section><h2>{title}</h2><div class="legend">{legend}</div>{"".join(parts)}</section>'


def table(headers, rows):
    return '<div class="scroll"><table><thead><tr>' + ''.join(f'<th>{html.escape(str(h))}</th>' for h in headers) + '</tr></thead><tbody>' + ''.join('<tr>' + ''.join(f'<td>{html.escape(str(v))}</td>' for v in row) + '</tr>' for row in rows) + '</tbody></table></div>'


def render(results, assumptions, annual, paths, sensitivity, history_label="真实 ETF 历史", strategy_description="三门择时、标普均线择时交易 TQQQ，以及买入持有；分别搭配短期国库券和 TLT。", sma_basis="", sma_model_note=""):
    first = next(iter(results.values()))
    last_year = int(first['end'][:4])
    rows = [[display_name(name), f"{m['cagr']:.2%}", f"{annual.loc[last_year, name]:.2%}", f"{m['max_drawdown']:.2%}", f"{m['sharpe']:.2f}", f"${m['growth_of_1']:.2f}", f"{m['risk_exposure']:.1%}", m['switches']] for name, m in results.items()]
    annual_rows = [[f"{year}{' *' if year in (int(first['start'][:4]), int(first['end'][:4])) else ''}", *[f"{v:.2%}" for v in row]] for year, row in annual.iterrows()]
    sensitivity_rows = [[display_name(getattr(r, 'strategy', r.defensive)), ['信号当日收盘（偏乐观）', '次日收盘（默认）', '再延迟一天'][int(r.execution_lag)], f"{r.switch_cost_bps:g} bp", f"{r.cagr:.2%}", f"{r.max_drawdown:.2%}"] for r in sensitivity.itertuples()]
    details = ''.join(f'<li>{html.escape(line)}</li>' for line in assumptions)
    basis_copy = f'<p class="basis"><strong>均线信号：</strong>{html.escape(sma_basis)}。<strong>TQQQ 收益：</strong>{"上市后分红复权，上市前为合成" if "合成" in history_label else "分红复权收益"}。</p>' if sma_basis else ''
    model_copy = '<p class="subtitle">SPYSIM 为总收益近似重构，非 Testfol 原始序列；早期分红估计见口径说明。</p>' if "SPYSIM" in sma_basis else ''
    return f'''<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TQQQ Gate · 本地独立回测</title>
<style>
:root{{color-scheme:light}}*{{box-sizing:border-box}}body{{margin:0;background:#f4f5f0;color:#242d28;font:16px/1.65 system-ui,-apple-system,sans-serif}}main{{max-width:1180px;margin:0 auto;padding:48px 30px}}header{{padding-bottom:24px;border-bottom:2px solid #242d28}}h1{{font-size:38px;line-height:1.2;margin:8px 0 16px;letter-spacing:-1px}}h2{{font-size:23px;font-weight:600;margin:0 0 16px}}p{{margin:6px 0}}.subtitle{{color:#59645b}}.basis{{margin-top:16px}}section{{margin-top:34px}}.scroll{{overflow:auto}}table{{border-collapse:collapse;width:100%;font-size:14px;font-variant-numeric:tabular-nums;background:#fff}}th,td{{text-align:right;padding:13px 14px;border-bottom:1px solid #e4e8e1;white-space:nowrap}}th{{font-size:12px;color:#5d6a60;background:#edf0e9}}th:first-child,td:first-child{{text-align:left}}svg{{display:block;width:100%;background:#fff;margin-top:12px}}svg text{{font:12px system-ui;fill:#617064}}.legend{{display:flex;flex-wrap:wrap;gap:20px;font-size:13px}}.legend i{{display:inline-block;width:10px;height:10px;margin-right:7px}}li{{margin:9px 0}}a{{color:#12745b}}summary{{cursor:pointer;font-weight:600}}footer{{margin-top:40px;color:#647268;font-size:13px}}@media(max-width:600px){{main{{padding:24px 16px}}h1{{font-size:29px}}}}
</style><main>
<header><h1>TQQQ Gate · 本地独立回测</h1>
<p>{first['start']} — {first['end']} · {first['sessions']:,} 个估值收盘 · {html.escape(history_label)}</p>
<p class="subtitle">{html.escape(strategy_description)}</p>{basis_copy}{model_copy}</header>
<section><h2>同一时间窗，策略对比</h2><p class="subtitle">{last_year} 年收益截至 {first['end']}，包含期间换仓成本。</p>{table(['策略','年化收益',f'{last_year}年收益','最大回撤','Sharpe','初始 $1 →','TQQQ 时间','换仓次数'], rows)}</section>
{plot(paths['equity'], '净值增长 · 对数坐标', True)}
{plot(paths['drawdown'], '从账户历史高点回撤')}
<section><h2>年度收益</h2><p class="subtitle">* 首尾年份为部分年度。数值含切换成本。</p>{table(['年份', *[display_name(name) for name in annual.columns]], annual_rows)}</section>
<section><h2>执行时点与成本</h2><p class="subtitle">默认次日收盘成交；信号当日收盘的算法可能提前获得收益。</p><details><summary>查看 {len(sensitivity)} 组敏感性结果</summary>{table(['策略 / 防守资产','执行时点','每次切换成本','年化收益','最大回撤'], sensitivity_rows)}</details></section>
<section><h2>复算口径与限制</h2><ul>{details}</ul>
<p>作者完整历史引擎未公开；本报告是公开规则与明确数据假设的独立实现，不能把数字差异全部归因于规则实现。</p></section>
<footer>来源：<a href="https://willperryyy.github.io/tqqq-gate/whitepaper.html">作者白皮书</a> · <a href="https://github.com/WillPerryyy/tqqq-gate">公开信号源码</a> · <a href="https://finance.yahoo.com/">Yahoo Finance</a> · <a href="https://testfol.io/help/">Testfol 方法说明</a> · <a href="https://github.com/SteelCerberus/us-market-data">历史分红重构</a><br>完整逐日收益、信号、成交日期、年度收益和数据 SHA-256 清单保存在本地。历史回测不保证未来结果。</footer>
</main></html>'''
