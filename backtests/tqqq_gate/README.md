# TQQQ Gate 本地回测

独立实现 [作者白皮书](https://willperryyy.github.io/tqqq-gate/whitepaper.html) 和公开 JavaScript 规则。详细来源核对在 [研究笔记](../../docs/research/tqqq-gate-source.md)。不依赖 FinanceBuddy 前端，不改动仪表盘。

默认回测真实 TQQQ 上市后的 2010-02-11 起历史，并比较 TQQQ/T-bill、TQQQ/TLT、TQQQ 持有、QQQ 持有。数据结束于各资产共同可用日。`data/` 与 `results/` 是本地生成文件，不提交行情数据或密钥。

## 复跑

从仓库根目录执行。需要 Python 3.10+、Node.js（仅源码核对时需要），依赖为 numpy/pandas/yfinance。

当前已创建的虚拟环境在 `/Users/mac/workspace/financebuddy/backtests/tqqq_gate/.venv/`，Python 3.12.14，yfinance 1.7.0。可运行 `source backtests/tqqq_gate/.venv/bin/activate`，也可直接使用 `.venv/bin/python`；不修改系统 Python。原先真实基金报告用 Codex 内置 Python，目前新增工作使用此项目环境。

```sh
uv venv --python 3.12 backtests/tqqq_gate/.venv
uv pip install --python backtests/tqqq_gate/.venv/bin/python -r backtests/tqqq_gate/requirements.txt

# 读取仓库 .env 的 API_KEY，或环境变量 TWELVE_DATA_API_KEY；不打印密钥。
backtests/tqqq_gate/.venv/bin/python backtests/tqqq_gate/download.py --end 2026-10-13

# 已下载快照后，本地回测不访问网络。
backtests/tqqq_gate/.venv/bin/python backtests/tqqq_gate/backtest.py
open backtests/tqqq_gate/results/report.html
```

当前 Codex 环境也可直接用已包含 numpy/pandas 的运行时，无需安装：

```sh
/Users/mac/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 backtests/tqqq_gate/backtest.py
```

`download.py` 默认复用本地 ETF 与 FRED 文件，`--refresh` 才覆盖下载。QQQ/TLT 历史超过每页 5,000 条时分页。不同下载批次的数据可能有供应商修订，`data/manifest.json` 记录 SHA-256 与来源；若要精确复现当前结果，保留这批快照。请求日期不代表供应商已提供该日数据，本次 ETF 只提供到 2026-10-12。

## yfinance 与 1985 起合成回测

Yahoo 数据保存在独立 `data/yahoo/`，不会覆盖原 Twelve Data 快照。直连曾被 Yahoo 限流/拒绝；使用用户本机代理后已成功取得到 **2026-10-13** 的全部必要序列，NDX 从 **1985-10-01** 起。不能只凭错误信息推断“大陆无法使用”或全局限流严重，出口和请求通道均会影响结果。

```sh
# 首次下载或明确刷新；--proxy 只影响这次 yfinance，不改系统网络设置。
backtests/tqqq_gate/.venv/bin/python backtests/tqqq_gate/download_yahoo.py --proxy http://127.0.0.1:10808 --refresh

# 后续默认读本地 raw CSV，不重复访问 Yahoo；文件与 manifest 记录原始/复权字段。
backtests/tqqq_gate/.venv/bin/python backtests/tqqq_gate/download_yahoo.py

# Yahoo 真实基金段，输出到独立目录。
backtests/tqqq_gate/.venv/bin/python backtests/tqqq_gate/backtest.py --data-dir backtests/tqqq_gate/data/yahoo --output backtests/tqqq_gate/results/yahoo

# 1985-10-01 至共同可用日：上市前模型，上市后真实复权收益。
backtests/tqqq_gate/.venv/bin/python backtests/tqqq_gate/long_history.py
open backtests/tqqq_gate/results/long_history/report.html

# 早期分红是假设，不是真实历史；可明确变更并保存另一份报告。
backtests/tqqq_gate/.venv/bin/python backtests/tqqq_gate/long_history.py --pre-qqq-dividend-yield 0.005 --output backtests/tqqq_gate/results/long_history_dividend05
```

下载显式 `auto_adjust=False, repair=False`，ETF 收益使用 `Adj Close`，NDX 信号使用 `Close`；请求截止日为包含的日期，转换为 Yahoo 不包含的 `end`。缓存/日期/供数不足会保留在 manifest 中；遇限流停止请求，不默默替换成别的供应商。`^XNDX` 本次仅返回一行，不能支持早期总收益历史。

合成口径：

- 1999-03-11 前的 1×收益采用 NDX 价格收益，默认早期分红假设 **0%**；之后使用真实 QQQ 复权收益。缺少早期分红的影响会单独检查，而不把价格指数宣称为总收益。
- 2010-02-12 前采用每日 3×基础收益，减 `2×(前日短债年率+0.45%)+0.95%` 的 `/252` 成本；之后使用真实 TQQQ 复权收益，无二次扣费。模拟的是每日重置，不能把整段累计收益直接乘三。
- 2002-07-31 前用十年期收益率 `^TNX` 驱动每日滚动的 **20 年平价债券模型**，半年付息、平坦收益率曲线，扣年费 0.15%；之后接真实 TLT 复权收益。债券随自然日 aging 的 dirty price 已含应计收益，不再重复加一次票息。十年期收益率不是实际二十年期报价，早期结果不是可交易 TLT 历史。
- 1985 年初至 9 月无本次 NDX 数据；报告从实际首日 1985-10-01 开始。没有 250 日预热信号时持防守资产，本次首次 TQQQ 建仓为 1986-10-13。既不倒填早期信号，也不使用未来数据补预热。
- 每个资产的实际/合成日期逐日记录在 `asset_returns_and_sources.csv`。日收益 `<= -100%` 会终止模型；真实 ETF 覆盖期缺价也报错。利率缺数最多沿用此前值 10 个自然日，不跨长期缺口填补。

长历史报告额外给出模型与真实基金重叠段的日收益相关性、年化跟踪误差、48 组执行/成本结果，以及 36 组早期分红/融资利差敏感性（`model_sensitivity.csv`）。相关性只是模型检查，不能证明 1985 年基金实际存在、融资利差固定或危机模型准确。来源细节见 [长历史研究笔记](../../docs/research/tqqq-gate-long-history-sources.md)。

## SPYSIM 总收益近似的 200 日均线 ±4% 对照

长历史报告与真实基金报告默认使用 `SPYSIM TR SMA200 +/-4% / T-bill`、`SPYSIM TR SMA200 +/-4% / TLT`（长历史上市前部分为债券模型）。页面显示“SPYSIM 总收益近似”，与此前的 ^GSPC 价格信号区分。与三门版本使用相同的 TQQQ 收益、成交延迟和切换费用。原价格信号报告已保留在 `results/price_signal_archive/`。

- 默认以 **含分红复投的 SPYSIM 近似序列**计算简单 200 日均线，包含当日；交易标的始终为 TQQQ。SPY 上市后使用 Yahoo SPY Adj Close 收益，加回年费 0.0945%；上市前使用 Testfol 官方帮助引用的历史数据项目 `Adjusted Close`，包含历史分红，按该项目公式逐日撤回0.0945%的模拟费率。接缝用收益率，不拼不同尺度价格。
- 历史数据固定于 `SteelCerberus/us-market-data` 提交 `f018e734c2c0b81981e100cb180802a5ef83a0c5`，提取1984-01-03至1993-01-29；该段季度分红分摊含回溯估计。它是总收益**近似重构**，不是原始 Testfol SPYSIM，也不是严格时点可用的早期数据。页面顶部和口径说明均标注这一限制。
- 收盘价 **严格高于 SMA200×1.04** 时买入 TQQQ；**严格低于 SMA200×0.96** 时退出；中间区域及恰好触及边界均保持原仓位。
- 状态从初始防守开始计算，满 200 个价格后才可入场。信号序列从 1984 年起构建，在 1985-10-01 回测开始前完成预热；这段预热使用上述含历史分红估计的重构数据。单个收盘触发即可，不叠加三门策略的双日确认。
- 默认昨日信号、今日收盘成交，新仓承担下一日收益；不会在计算信号的同一收盘价提前成交。
- 完整均线、上下轨、偏离值、有效状态与目标信号保存在 `sma200_signals.csv`。净值、年度收益、成交日志与敏感性均包括两条均线对照。

下载器补齐 `SPY.csv`、`SPYSIM_early.csv` 及其来源说明，其它已有快照复用；后续回测不访问网络。`--sma-basis price` 可明确恢复此前 ^GSPC 价格指数版本，默认是 `spysim`。

```sh
backtests/tqqq_gate/.venv/bin/python backtests/tqqq_gate/download_yahoo.py --proxy http://127.0.0.1:10808
backtests/tqqq_gate/.venv/bin/python backtests/tqqq_gate/long_history.py
backtests/tqqq_gate/.venv/bin/python backtests/tqqq_gate/backtest.py --data-dir backtests/tqqq_gate/data/yahoo --output backtests/tqqq_gate/results/yahoo
# 明确选择价格指数作为研究对照，不覆盖总收益主报告。
backtests/tqqq_gate/.venv/bin/python backtests/tqqq_gate/long_history.py --sma-basis price --output backtests/tqqq_gate/results/price_comparison
```

若显式选择旧 Twelve Data 数据目录，总收益均线同样需要该目录中的 `SPY.csv` 与 `SPYSIM_early.csv`；若选择 `--sma-basis price`，需要 `SP500.csv`。这些是独立信号输入，不改变 ETF 收益口径。

## 交易规则与口径

- 信号默认来自 FRED Nasdaq-100 **价格指数**，使用简单日收益的样本标准差（ddof=1）。20 日年化波动 <35%，20/250 日波动比 <1.10。
- 回撤相对最近 250 个收盘最高点，含当日；低于 -20% 关闭回撤门，高于 -10% 打开，中间保持前一状态。门初始打开，组合目标仓位初始防守。
- 组合 verdict 连续两天为 1 入场，连续两天为 0 退出；完整预热期在投资区间前计算，分年分析不重置信号状态。
- 默认 `--execution-lag 1`：t 日收盘计算的信号在 t+1 日收盘成交，新仓赚 t+1 收盘至 t+2 收盘的收益。`position_close[t]=signal[t-1]`，`position_earning[t]=position_close[t-1]`。每笔交易 CSV 有信号日期和成交日期。
- `--execution-lag 0` 是信号当日收盘成交的偏乐观版本，等同常见的 `signal.shift(1)*daily_return`。完整作者回测引擎未公开，不能假定它的“一天延迟”一定采用严格次日收盘。
- 每次切换的总摩擦成本默认 2.5 bp，两次切换完整往返 5 bp。是组合层固定比例，未逐腿模拟股票券商佣金、最低费用或滑点；初始建仓也扣同样成本，期末不强制平仓。可传 `--switch-cost-bps 5` 等。
- ETF 请求 Twelve Data `adjust=all`（拆股与分红复权），收益包含基金费用，不重复扣费。QQQ 非分红复权版本 `adjust=splits` 只用于额外信号比较；本次该价格与全复权历史显著不同，确认请求并非悄悄沿用默认复权模式。[官方参数](https://github.com/twelvedata/twelvedata-java/blob/main/docs/MarketDataApi.md)
- 防守现金用 FRED DTB3 的上一交易日数值 /100/252 作计息代理；它是**银行贴现率报价**，没有转成精确投资收益率，也不模拟实券滚动交易。[官方定义](https://fred.stlouisfed.org/series/DTB3)
- 默认初始资金 $1，无入金、提款或税款，所有收益复投。CAGR 按自然日跨度，波动和 Sharpe 按 252 交易日；Sharpe 扣现金代理收益。年表首尾为部分年份。
- 缺失资产价格直接报错，不用填价人为平滑风险。FRED 利率可沿用此前已知值。

## 输出和额外比较

`results/report.html` 是无需网络的图表报告。`summary.json` 保存假设、参数、指标和原始数据校验码；`summary.md` 为简表。CSV 包括逐日仓位/成本/收益、净值、回撤、完整预热信号、成交记录、年度收益和 48 组成本/执行延迟敏感性。

```sh
# 使用网页实际 QQQ 信号，与白皮书的 NDX 信号区分。
backtests/tqqq_gate/.venv/bin/python backtests/tqqq_gate/backtest.py --signal qqq --output backtests/tqqq_gate/results/qqq_signal

# 截断至白皮书页尾数据日期。
backtests/tqqq_gate/.venv/bin/python backtests/tqqq_gate/backtest.py --end 2026-08-07 --output backtests/tqqq_gate/results/paper_window

# 可选长历史代理，生成单独文件，不混入真实基金表。
backtests/tqqq_gate/.venv/bin/python backtests/tqqq_gate/backtest.py --synthetic
```

`--synthetic` 从 FRED 1986 年数据开始，250 日预热后估值；2010-02-12 起接真实 TQQQ 日收益。此前以 `3*NDX_price_return - [2*(bill_rate+0.45%)+0.95%]/252` 模拟，因此**没有早期指数分红**，不是作者未公开的 QQQ 总收益重构，也没有合成 TLT。相关数字只存 `synthetic_proxy_*`，不能冠以“完整复现 1985 年策略”。

未实施税务递延变体、定投、参数优化或 walk-forward 搜索。当前回测验证的是固定规则和这些明确假设下的历史表现，不是独立样本证明。

## 验证

`audit_next_open.py` 单独比较真实 TQQQ 存续期的信号当日收盘、次日开盘和次日收盘执行。使用缓存 OHLC，先计算旧仓的隔夜收益，再按开盘价换仓、计算新仓日内收益；每日短债计息在隔夜/日内间的分配另做敏感性检查。输出到 `results/next_open_audit/`，不改变主报告。上市前合成序列只有日收益，不能据此确定开盘成交结果。

```sh
backtests/tqqq_gate/.venv/bin/python backtests/tqqq_gate/audit_next_open.py
```

```sh
backtests/tqqq_gate/.venv/bin/python -m unittest discover -s backtests/tqqq_gate -p 'test_*.py' -v
node backtests/tqqq_gate/verify_author.mjs
backtests/tqqq_gate/.venv/bin/python backtests/tqqq_gate/verify_author.py
```

行为测试还覆盖合成融资公式、固定收益率下的债券持有收益与周末时间、升息导致长债跌价、真实基金接缝、不重复扣费、杠杆破产、利率长期缺口和 Yahoo 交易日期。源码核对直接从保存的网页提取作者 `compute()`，在最近 420 个价格的所有 169 个可计算前缀上运行，再与独立 Python 的状态及指标数值逐日比较。
