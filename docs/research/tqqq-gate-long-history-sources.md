# TQQQ Gate 长历史数据与合成口径

研究日期：2026-10-14。本文记录可核验的数据覆盖与模型建议。主线程随后通过本机代理完成 Yahoo 下载；本文已读取实际 CSV、核对行数与 SHA-256。现有策略来源见 [tqqq-gate-source.md](tqqq-gate-source.md)。

## 数据覆盖：成立日期不等于能下载的第一条记录

| 数据 | 一手证据 | 本次核验结果 |
|---|---|---|
| Nasdaq-100 价格指数 NDX | [Nasdaq 指数版本表](https://indexes.nasdaq.com/docs/index_versions_ndx.pdf)基准日 1985-01-31 | 官方定义明确不计普通现金分红；不能将其称为总收益 |
| FRED `NASDAQ100` | [FRED 数据表](https://fred.stlouisfed.org/data/NASDAQ100) | 日收盘数据从 **1986-01-02** 起；本地现有 CSV 首条同为该日 |
| Yahoo `^NDX` | [Yahoo 历史页](https://finance.yahoo.com/quote/%5ENDX/history/)、[本地下载 manifest](../../backtests/tqqq_gate/data/yahoo/manifest.json) | 经代理成功取得 **1985-10-01 至 2026-10-13，10,338 行**。首条收盘 112.13999938964844；已核对实际 CSV 和 SHA-256 |
| CSI 的 NDX 产品 | [CSI 官方证券覆盖表](https://apps.csidata.com/factsheets.php?exchangeid=INDEX&format=htmltable&type=stock) | NDX 标识 5491，覆盖起日 **1985-10-01**，与白皮书日期吻合；覆盖表不是实际日线下载，不能据此填入 1985 数据 |
| Nasdaq-100 总收益 XNDX | [Nasdaq 指数版本表](https://indexes.nasdaq.com/docs/index_versions_ndx.pdf)、[FRED 数据表](https://fred.stlouisfed.org/data/NASDAQXNDX) | FRED 从 **1999-03-04** 起；XNDX 将现金分红在除息日复投。本次未找到公开、可核实的 1985 起日度总收益序列 |
| TQQQ | [ProShares 基金说明](https://www.proshares.com/our-etfs/leveraged-and-inverse/tqqq)、[事实表](https://www.proshares.com/globalassets/proshares/fact-sheet/prosharesfactsheettqqq.pdf) | 目标为 Nasdaq-100 每日收益 3 倍，成立于 2010-02-09；本次 Yahoo CSV 实际从 **2010-02-11** 起，4,193 行 |
| TLT | [iShares 基金说明](https://www.ishares.com/us/products/239454/ishares-20-year-treasury-bond-etf) | 成立于 2002-07-22，持有剩余期限超过 20 年的美国国债；本次 Yahoo CSV 从 **2002-07-30** 起，6,091 行。不能按官方成立日倒填行情 |

主线程下载使用 yfinance 1.7.0，请求起日 1985-01-01、截止 2026-10-13，`auto_adjust=False`、`repair=False`。[本地 manifest](../../backtests/tqqq_gate/data/yahoo/manifest.json)记录实际覆盖：QQQ 为 1999-03-10 起，6,942 行；`^IRX`、`^TNX` 都是 1985-01-02 起，10,480 行；`^XNDX` 却只返回 2026-10-13 一行，不能支持历史总收益。全部截止 2026-10-13。Yahoo `^XNDX` 缺历史不代表 FRED `NASDAQXNDX` 也缺历史。

实际 CSV 与全部 8 个 manifest 条目的 hash/行数一致。先前直连超时、限流说明访问路径的问题，经代理已解决；不能再把 1985 数据描述为未取得。1985-01-01 至 09-30 的 NDX 在这次 Yahoo 下载中仍不存在，不可伪造。

作者公开数据也没有补齐缺口。本次通过 GitHub 连接器核对 [tqqq-gate 文件树](https://api.github.com/repos/WillPerryyy/tqqq-gate/git/trees/3f62919bd99ed6a43627d72f273f0b87b53ef8db?recursive=1)、[分支](https://api.github.com/repos/WillPerryyy/tqqq-gate/branches)、[releases](https://api.github.com/repos/WillPerryyy/tqqq-gate/releases)：仅 `master`，没有 release，没有全历史 CSV；`data.json` 仅网站近期 QQQ。搜索作者公开仓库返回 `tqqq-gate`、`osrs-advisor`、`finance-tracker`、`daily-paper`、`arb-scanner`，其中财务相关仓库文件树也未发现完整 NDX 缓存。不能据此断言作者没有私有原始数据。

## yfinance 的输入口径

下载时显式使用 `auto_adjust=False, actions=True, interval="1d"`，保存 `Close`、`Adj Close` 和公司行动。资产日收益使用 `Adj Close.pct_change(fill_method=None)`；信号可用 NDX 的 `Close`。这让信号价格与分红复投收益各自清楚。[yfinance 下载参数](https://ranaroussi.github.io/yfinance/reference/api/yfinance.download.html)的 `end` 是不包含的终止日期。yfinance 的 [auto_adjust 源码](https://github.com/ranaroussi/yfinance/blob/main/yfinance/utils.py)用 `Adj Close / Close` 调整 OHLC 并把 `Adj Close` 重命名为 `Close`；不能因拿到了 `Adj Close` 就推断一个价格指数自动包含分红。

每份下载应记录请求日期、实际第一/最后非空日期、行数、供应商、调整方式、SHA-256。不要把 `YFRateLimitError` 当成该证券没有历史。不要把无观测的早期价格前向/后向填充，更不能用随机收益填成所谓 1985 历史。

## 合成 TQQQ：日复利、分红和融资必须分开说明

与白皮书对应的近似式：

```text
r_synthetic[t] = 3 * r_underlying_total_return[t]
                 - (2 * (annual_tbill_rate[t-1] + 0.0045)
                    + 0.0095) / 252
wealth[t] = wealth[t-1] * (1 + r_synthetic[t])
```

0.45% 融资加点、0.95% 基金费率是白皮书的模型参数，不能表述成历史实际基金成本。ProShares [招募说明书](https://www.proshares.com/globalassets/proshares/prospectuses/tqqq_summary_prospectus.pdf)明确融资和交易成本不在基金运营费率表内，因此仅乘三再减基金费率会漏融资。

建议输入分段为：真实 TQQQ 首条有效价格之后用真实复权收益；1999 年后、真实 TQQQ 之前用 QQQ 复权收益或 XNDX 总收益；1999 年之前用 NDX 价格收益，并明确这是**分红缺失的价格收益代理**。若添加早期假设股息率 `d`，用 `r_total ≈ r_price + d/252`，分别测试 0%、0.5%、1%，必须把假设值展示出来；不能叫真实总收益。不应使用未来样本拟合一个股息率后无标注地倒推。

QQQ 自身费用已包含在复权收益中；三倍 QQQ 模型会把这段费用也放大，相比三倍指数有额外拖累。能取得 XNDX 时可另给指数输入敏感性，避免悄悄混用。

利息按交易日 `/252` 能匹配白皮书，但周末不单独计息；自然日版本可使用前一期已知利率乘 `calendar_days / 365`（融资按实际 convention 可选 `/360`）。两者属于不同模型，不要将其混为同一口径。真实 ETF 复权收益段不要再扣一次模拟融资与基金费率。任何合成日收益 `<= -1` 都应显式报错/记录破产，不应夹成一个很小的正净值后继续复利。

## 合成债券：先匹配白皮书，再给期限收益率敏感性

白皮书的长债模型用 10 年国债收益率驱动固定期限平价债券，再减年费率 0.15%；20 年期限只是它的一个模型变体。采用 FRED `DGS10` 或 Yahoo `^TNX` 可以复建该假设，应命名为 **10 年收益率驱动的 20 年平价债券代理**，不是 1985 年真实 TLT。[白皮书公开来源](https://willperryyy.github.io/tqqq-gate/whitepaper.html) 当前主线程选用 Yahoo `^TNX`，并在真实 TLT 复权收益可计算之后切换。

设年收益率为小数 `y`，期限 `M` 年，面值 1，半年付息，昨日买入平价债券票息 `c = y[t-1]`：

```text
P(y, c, M) = sum(k=1..2M, (c/2) / (1+y/2)^k)
             + 1 / (1+y/2)^(2M)
r_bond[t] ≈ P(y[t], y[t-1], M) / P(y[t-1], y[t-1], M)
            - 1 + y[t-1] * dt - 0.0015 * dt
```

这是重新定价加近似持有收益的日模型，其中 `dt` 必须明确为交易日 `1/252` 或自然日间隔。平价旧收益率下分母应约等于 1，是容易验证的性质。每个价格计算必须固定昨日票息，不能把今日票息也设为今日收益率，否则始终平价并抹掉价格损益。若已经在现金流折现中缩短剩余期限、含应计利息，则不能再加上述 carry，否则重复计息。

久期/凸性版本是同一个模型的二阶近似：`r ≈ y_prev*dt - D_mod*Δy + 0.5*C*(Δy)^2 - fee*dt`；不要固定使用当前 TLT 久期倒推 40 年，因为不同利率下久期不同。精确重定价适合明显升降息日。

更贴近长债期限的独立敏感性可用 20/25/30 年模型及对应期限收益率，但 FRED 长期收益率有真实中断：

- [财政部](https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?page=0&type=daily_treasury_long_term_rate)明确 20 年 CMT 在 **1987-01-01 至 1993-09-30** 没有数据。若填补，可以用同日 `0.5*DGS10 + 0.5*DGS30` 作**估计**。[美联储 2020-08-31 公告](https://www.federalreserve.gov/feeds/h15.html)说明这恰是过去误发布后删除的估计值；不能冒称官方实际 20 年观测。
- [FRED DGS30](https://fred.stlouisfed.org/series/DGS30)注明 30 年 CMT 于 **2002-02-18** 停止、**2006-02-09** 恢复。若实际 CSV 却呈连续记录，仍须核对来源口径，不能仅凭非空判定这些值是同期真实报价。
- 只有节假日/短期缺数才用前一期利率有限填补，不能跨多年用一个旧利率。10 年收益率可支持白皮书代理，无法证明真实 20+ 年债券指数收益。

真实 TLT 上市之后应使用复权日收益，接缝用收益率拼接，不要直接粘贴两个不同尺度的价格。将模型继续跑到真实基金覆盖期，可以检查年度收益、日收益相关性和误差；相关性高并不能证明早期收益精确。

## 可执行的交付边界

1. 数据下载器支持请求从 1985 开始，并保留缓存优先；实际 Yahoo 覆盖从 **1985-10-01** 起，FRED 老快照从 1986 起。报告以实际输入文件为准，不应标成从 1985-01-01 起完整回测。
2. 250 日波动及两日确认需要冷启动。实际 Yahoo NDX 的第 251 个价格是 **1986-09-26**，第 252 个是 **1986-09-29**；前者是首个可计算全部门条件的日期，后者仅是最早可能完成两日确认的日期，不保证当天信号实际允许开仓。以从 1985-10-01 计息现金开始的版本，必须明确前 250 个价格没有有效风险信号、先持现金；依实际市场规则与成交延迟行动，不倒填信号，也不为补预热伪造成立前数据。
3. 报告分列真实基金段、合成延伸段、各资产真实/模型日期、早期分红假设、融资参数、债券期限与收益率输入。
4. 不必为补利率耗 ETF 服务额度：FRED 的 `NASDAQ100`、`NASDAQXNDX`、`DTB3`、`DGS10`、`DGS20`、`DGS30` 可作为公开输入。此次 Yahoo `^IRX`、`^TNX` 历史也已下载缓存，不需要重复请求。

本文未改回测实现、Python 环境或其它文件。下载覆盖以本地 manifest 和实际 CSV 为准。
