# 行情复权口径

股票与 ETF 的 K 线、RSI、ROC、SMA、EMA、Ratio ROC 及封面读数统一使用 Twelve Data 的 `time_series?adjust=all`：历史 OHLC 同时按拆股与现金分红调整，以最新价格为基准。不是只复权收盘价，也不在 RSI 的结果上额外叠加一条均线。RSI 保持现有 Wilder 平滑，周期为 6 时递推权重为 1/6。

此前未传 `adjust`，使用 Twelve Data 默认的 `splits`，现金分红没有纳入调整。2026-10-16 实测 2026-10-15 的 QQQ：旧口径 RSI(6) 为 26.001632；显式 `adjust=all` 后为 26.064591，保留三位小数为 **26.065**，与用户富途牛牛前复权日线读数一致。Yahoo 的 Adj Close 对照为 26.064622，微小差别来自来源价格精度。这些数值是核验结果，不是应用常量，也不保证两家数据商在所有日期逐位相同。

## 缓存与刷新

前复权因子会在后续分红、拆股时改变历史价格。仅从最后一根日线之后做增量，会把不同因子的价格拼接起来。因此浏览器在六小时缓存过期后请求最多 5000 根完整日线并整体替换；失败时继续使用同一复权口径的旧快照，不更新同步时间。

浏览器 IndexedDB 键为 `bars:all:{symbol}:{interval}`，React Query 键也包含 `all`，不复用旧口径。VPS 快照键为 `td:time_series:{symbol}:{interval}:{adjust}`，并发请求与失败冷却也按该键隔离。VPS 支持 `all`、`splits`、`dividends`、`none`；省略时沿用上游默认 `splits`，应用本身始终明确传 `all`。

开发期有 `API_KEY` 时 Vite 运行当前版本的共享缓存核心，布局仍可转发至已配置的 VPS；无本地 Key 时行情也转发至 VPS。部署需先更新 VPS 的 `td-cache` 服务，再部署发送新参数的前端，旧服务会拒绝 `adjust` 参数。无需删除原快照或清空布局存储。

## 与美股指标页的区别

美股指标页展示 `^GSPC`、`^NDX`、`^VIX` 价格指数自身的已完成日线，不以 SPY、QQQ 替换；QQQ 与 NDX 的 RSI 不必相同。指数 PE-TTM 与百分位来自蛋卷基金的基本面快照，不受图表的价格复权影响。详见[美股指标口径](market-indicators.md)。

参考：[Twelve Data 调整说明](https://support.twelvedata.com/en/articles/5179064-are-the-prices-adjusted)、[Twelve Data Time Series](https://twelvedata.com/docs#time-series)、[富途复权说明](https://support.futunn.com/topic813?from_platform=1&lang=zh-cn)。
