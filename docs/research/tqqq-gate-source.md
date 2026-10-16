# TQQQ Gate：一手来源与本地回测口径

读取日期：2026-10-14。本文只记录原网站、作者公开源码和可核验的实现细节；网站业绩数字是作者报告，尚未独立复现。仓库原先只有 `docs/agents/` 和 `docs/adr/`，无研究笔记惯例，故新增 `docs/research/`。

## 来源与公开程度

- [白皮书](https://willperryyy.github.io/tqqq-gate/whitepaper.html)：完整叙述、业绩表、变体与限制。
- [公开仓库](https://github.com/WillPerryyy/tqqq-gate)：读取时 `master` 最新提交为 `3f62919bd99ed6a43627d72f273f0b87b53ef8db`。以下源码链接固定于该提交，便于复核。
- [README](https://github.com/WillPerryyy/tqqq-gate/blob/3f62919bd99ed6a43627d72f273f0b87b53ef8db/README.md)：公开网页使用 QQQ 收盘价，作者称与 `tqqq-strategy/spec.py` 的 Python 规则在 2000–2026 的 6,646 个交易日中有 99.98% 信号一致率。这是作者声明，不是本地验证。
- [index.html](https://github.com/WillPerryyy/tqqq-gate/blob/3f62919bd99ed6a43627d72f273f0b87b53ef8db/index.html)：完整可读的 JavaScript 信号状态机。
- [update_data.py](https://github.com/WillPerryyy/tqqq-gate/blob/3f62919bd99ed6a43627d72f273f0b87b53ef8db/update_data.py)：公开行情抓取脚本。
- [data.json](https://willperryyy.github.io/tqqq-gate/data.json)：网站近期行情。读取时为 QQQ，420 个交易日，2025-02-11 至 2026-10-13，更新于 2026-10-13T23:49:39Z；并非 41 年原始回测数据。

公开仓库文件中没有白皮书提到的 `fetch_data.py`、`signal_today.py`、`validate.py`、`robustness.py`、`taxable_validate.py`、`net_compare.py` 或 `tqqq-strategy/spec.py`。尝试访问 [同作者的 tqqq-strategy 仓库](https://github.com/WillPerryyy/tqqq-strategy) 和其原始 `spec.py` 返回 404；只能确定当前公开访问不可用，不能确定是否存在私有仓库。因此可以独立实现公开规则，不能声称已复跑作者完整引擎。[来源：公开仓库](https://github.com/WillPerryyy/tqqq-gate)、[白皮书 Running it](https://willperryyy.github.io/tqqq-gate/whitepaper.html)

## 基础规则：可按源码精确实现

以下全部来自公开 [index.html 的 `compute` 函数](https://github.com/WillPerryyy/tqqq-gate/blob/3f62919bd99ed6a43627d72f273f0b87b53ef8db/index.html)。白皮书叙述的信号资产为 Nasdaq-100 指数；公开网站实际用 QQQ 原始收盘价。

1. 日收益为简单收益 `close[t] / close[t-1] - 1`，不是对数收益。
2. 波动为样本标准差，分母 `n-1`，对应 Pandas `std(ddof=1)`。
3. `v20 = std(last 20 daily returns) * sqrt(252)`；门 1 在 `v20 < 0.35` 时打开。
4. `v250 = std(last 250 daily returns) * sqrt(252)`；门 2 在 `v20 / v250 < 1.10` 时打开。
5. 高点为最近 250 个收盘价的最大值，包含当日；`dd = close[t] / rolling_high[t] - 1`。这是滚动高点，不是全历史最高点。
6. 门 3 是有记忆的状态：初始打开；`dd < -0.20` 关闭，`dd > -0.10` 打开，其余保持前一状态。因此恰好 -20% 或 -10% 均不触发变化。
7. 三门逻辑与得到组合 verdict。组合为 1 连续两天才进入 TQQQ；组合为 0 连续两天才退出。并非“每一门都要连续两天失败”，不同门在相邻两天造成组合失败同样可触发退出。
8. 确认后的目标仓位状态初始为 0（防守资产）。源码从第 251 个价格起计算门；至少 252 个价格才能产生经两日确认的第一条信号。回测可更早抓取历史作预热，避免交易区间第一年白白等待。
9. 每个门和组合在当日收盘后计算。README 明确“Reads the prior close; act at today's close”；白皮书说下一交易日行动、单日执行延迟。**实现推断**：若使用仅收盘价的严格下一日收盘成交，`t` 日信号在 `t+1` 日收盘切换，首先影响 `t+1` 收盘到 `t+2` 收盘的收益。将 `signal.shift(1)` 直接乘 `t` 日 close-to-close 收益，通常相当于前一日收盘已成交，时间口径需要另行标注，不能把两种实现混称为完全一致。[来源：README](https://github.com/WillPerryyy/tqqq-gate/blob/3f62919bd99ed6a43627d72f273f0b87b53ef8db/README.md)、[白皮书 Running it](https://willperryyy.github.io/tqqq-gate/whitepaper.html)

网页只保留 420 天并从初始状态重新运行，不能保留更早的回撤门历史。**推断**：当预热后始终落在 -20% 至 -10% 的区间，初始状态可能影响结果；长回测应连续计算状态，不要对每个分析子区间重新初始化。[来源：index.html](https://github.com/WillPerryyy/tqqq-gate/blob/3f62919bd99ed6a43627d72f273f0b87b53ef8db/index.html)、[update_data.py](https://github.com/WillPerryyy/tqqq-gate/blob/3f62919bd99ed6a43627d72f273f0b87b53ef8db/update_data.py)

## 交易资产与作者报告口径

白皮书主要业绩表的防守腿是 13 周 T-bill，空仓期间实际赚取当期利率；网站当前建议的防守腿改为 20 年国债 TLT（也列 VGLT/SPTL）。因此应至少分别输出 TQQQ/T-bill 与 TQQQ/TLT，不要将 36.59% 年化标签贴在 TLT 组合上。[来源：白皮书 The rule 与 Defensive leg](https://willperryyy.github.io/tqqq-gate/whitepaper.html)

作者报告的基础税前年化 36.59%、最大回撤 -46.75%、Sharpe 0.89、投入 TQQQ 时间 59.6%、每年 2.33 次完整往返；TQQQ 买入持有为年化 15.49%、最大回撤 -99.98%。但“Real fund only, 2010–2026”行的策略/持有年化为 43.19%/43.07%，策略主要优势是回撤，不能把 1985 起的超额收益直接当成真实 TQQQ 存续期优势。[来源：白皮书 What the complexity buys 与 Split-sample symmetry](https://willperryyy.github.io/tqqq-gate/whitepaper.html)

1985 至 2010-02 前 TQQQ 是合成序列，之后采用实际基金价格。白皮书给出的日合成公式是：

```text
synthetic_tqqq_return[t]
  = 3 * qqq_total_return[t]
    - (2 * (t_bill_annual_rate[t] + 0.0045) + 0.0095) / 252
```

作者声明与真实基金日收益相关系数 0.9989、年跟踪误差 2.9%。这不代表 1985 年真实存在可交易 TQQQ，也不独立验证危机融资假设。QQQ 自身也不覆盖 1985，因此 pre-QQQ 的指数总收益、分红重构细节仍缺少公开源码，无法精确确定。防守腿利率换算（日 252 或自然日）与缺失日期处理也未完整公开。[来源：白皮书 Where this fails 与页尾 Data](https://willperryyy.github.io/tqqq-gate/whitepaper.html)

文中成本称 `5bp round-trip costs`，即一个完整进出合计 5bp；但没有公开成本引擎，无法核验原实现究竟每次切换扣多少、两资产交易如何计费。独立回测应明确单次/往返定义，并提供成本敏感性。[来源：白皮书页尾 Data](https://willperryyy.github.io/tqqq-gate/whitepaper.html)

作者早期债券防守腿用 10 年国债收益率重构固定期限平价债券、减 0.15% 费率，再比较 10 年/20 年期限；不是全区间真实 TLT 总收益。20 年防守腿报告年化 40.95%、回撤 -48.17%；只计持有收益、不计收益率变化的 carry-only 版本为 37.38%，表明相当部分优势来自 1985 后收益率下降。真实基金期可直接用 TLT 复权价回测，长历史债券重构需另行注明。[来源：白皮书 What the money sits in while the gates are shut](https://willperryyy.github.io/tqqq-gate/whitepaper.html)

## 两个可选变体

- 波动目标：三门打开时，TQQQ 权重 `min(1, 0.25 / (3 * annualized_sigma_60))`。报告年化 17.84%、回撤 -28.73%。再平衡频率、未投入部分资产与成本细节未完整公开，实施时需列假设。[来源：白皮书 The defensive variant](https://willperryyy.github.io/tqqq-gate/whitepaper.html)
- 税务递延：门信号要退出且当前持仓盈利、持仓自然日数不超过 365、指数回撤仍大于 -20% 时延后卖出；亏损不递延，回撤超过 20% 的退出覆盖递延。它会增加市场暴露，因此税前比较应匹配风险。税率、年结税款、成本基础、逐笔 tax lot、补亏规则都影响结果；不宜在基础本地回测中默认套用美国税率。[来源：白皮书 The taxable-account variant 与 Risk-matched](https://willperryyy.github.io/tqqq-gate/whitepaper.html)

## 数据取得与适合本地核验的顺序

作者公开数据抓取方法为 Yahoo `v8/finance/chart`。其脚本固定用 `QQQ?range=3y&interval=1d`，读取 `indicators.quote[0].close`，保留最后 420 条，不使用 `adjclose`。完整本地历史需自行调用同一接口并使用明确起止日期；资产收益应另取拆股/分红复权总收益，信号价格则按各模式标注 ^NDX 或 QQQ。[来源：update_data.py](https://github.com/WillPerryyy/tqqq-gate/blob/3f62919bd99ed6a43627d72f273f0b87b53ef8db/update_data.py)

作者列明行情符号为 `^NDX`, `QQQ`, `TQQQ`, `^GSPC`, `^VIX`, `^VXN`, `^IRX`, `^TNX`，但没有在公开仓库提供完整原始日线 CSV。^IRX 的报价不能被当成资产价格收益；它是用于计算现金收益的年化利率输入，单位和实际报价惯例需核对。[来源：白皮书页尾 Data](https://willperryyy.github.io/tqqq-gate/whitepaper.html)

建议先在真实基金历史做四组基线：^NDX 信号 + TQQQ/T-bill、^NDX 信号 + TQQQ/TLT、TQQQ 持有、QQQ 持有；再输出 QQQ 信号版本与其差异，最后单独运行 pre-2010 合成扩展。用公开 JS 与近期官方 `data.json` 做规则一致性验证，同时核验下一日收盘成交的首次仓位和收益日期，随后再看年化、最大回撤、年度收益、换仓日志与敏感性。

## 必须保留的研究限制

1. **选择偏差**：作者承认搜索约 6,000 个指标/组合，参数网格 1,944 组。1996–2026 expanding walk-forward 报告年化 31.34%、回撤 -64.37%，固定参数 40.13%/-45.09%。独立复现固定规则不等于独立样本验证。[来源：白皮书 Validation](https://willperryyy.github.io/tqqq-gate/whitepaper.html)
2. **日期/快照不统一**：页头称 10,291 个交易日；债券表称 1985-10-02 至 2026-08-14、10,296 个交易日；页尾称 1985-10-01 至 2026-08-07、10,291 个观测。图和表终值也略有差别；动态信号是当前 `data.json`，静态业绩表仍为八月快照。因此本地对比必须先统一截断日，不能期待每个数字完全一致。[来源：白皮书](https://willperryyy.github.io/tqqq-gate/whitepaper.html)
3. **缺少完整回测源码**：严格交易延迟、现金利率换算、synthetic underlying 总收益、税款支付与历史债券模型只能重建假设，不能宣称精确复现。[来源：公开仓库](https://github.com/WillPerryyy/tqqq-gate)、[白皮书](https://willperryyy.github.io/tqqq-gate/whitepaper.html)
4. **仍有大亏损风险**：基础规则报告约 -47% 回撤；作者明确隔夜跳空不能靠收盘门保护。合成历史融资固定加点和长期债券的股债相关性都可能在未来失效。[来源：白皮书 Where this fails 与 Defensive leg](https://willperryyy.github.io/tqqq-gate/whitepaper.html)
