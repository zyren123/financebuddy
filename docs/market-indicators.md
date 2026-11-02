# 美股指标

Dashboard 默认显示「核对图表」；「美股指标」是按需打开的补充视图。两个面板保留挂载，切换时保留图表区间、图表实例和各视图的滚动位置。选择只属于 Browse State，不进入 Draft 或 Published Layout。Edit Mode 下先返回浏览，才能切换到指标。

## 指标口径

| 读数 | 来源与计算 |
| --- | --- |
| RSI(6) | Yahoo Finance 的 `^GSPC` / `^NDX` 已完成日线收盘价，复用前端 Wilder RSI 引擎。 |
| 52 周回撤 | 最近完成交易日收盘价 ÷ 截至该日过去 52 周最高日内价 − 1。历史覆盖不足时留空。 |
| TTM PE | 蛋卷基金估值表中的 `SP500` / `NDX`，不使用 ETF 代理。 |
| PE 百分位 | 同一估值表发布的近 10 年百分位。历史不足时来源使用全部历史；不从抽样周频历史另算一个分位。 |
| VIX | Yahoo Finance 的 `^VIX` 最近完成交易日收盘值。 |
| CNN 恐惧贪婪指数 | CNN 官方发布值及来源日期；访问失败时显示缺失，可单独重试。 |

价格衍生指标(RSI、回撤)在服务端用浏览器同一份纯函数(`src/market/metrics.ts`)计算，见 ADR-0005。PE 和来源发布的估值百分位属于外部基本面快照：它们不能从 OHLCV 推导，也不与前端 RSI 引擎混用。不同日期分别展示，超过七个日历日的读数标注「较早数据」。来源链接及统计说明可在界面中展开查看。

前瞻 PE 因没有选定可用来源，已按用户要求于 2026-10-16 从界面移除，不保留空行或占位说明。

端点、实际返回格式和未选用来源的原因见[来源核验记录](research/us-market-indicator-sources.md)。记录中的数值只是核验观察，不是产品里的固定读数。

## API 与缓存

美股指标和封面读数一起放在读数快照里,由 `GET /api/readings` 提供(ADR-0005)。URL 固定、不接受任何参数,非 GET 返回 405;`index.html` 用 preload 让它与 JS 并行下载,页面一打开就有数字,不必先点开页签。

VPS 上的 `server/readings.ts` 每 30 分钟重算一次快照。五个来源由 `server/marketData.ts` 的 `createMarketSource` 各自维持上次成功的结果,存在 Redis 的 `market:${feed}`:价格与估值六小时内直接用,CNN 三十分钟;过期才抓来源,失败回上次成功值(带它自己的旧日期),都没有时该项为「来源暂不可用」。读回存储时用 `parseMarketData` 重新校验。

Vercel 和 EdgeOne 配齐 `TD_CACHE_URL` 与 `TD_CACHE_TOKEN` 时经 `server/readingsApi.ts` 转发到 VPS,令牌只在服务端加入请求头;成功响应带 `public, max-age=60, s-maxage=60, stale-while-revalidate=600`。未配齐时在本进程计算,按出厂口径,存储在内存。VPS 备用前端的 nginx 已转发该路径并注入服务口令。

「重试缺失数据」绕过浏览器缓存重新取一次快照;失败的来源由服务端下一轮刷新自动重试,浏览器没有强制刷新上游的入口。

Yahoo 的当前未完成交易日不纳入价格指标。纽约日期用于价格和 CNN；蛋卷估值时间戳使用上海日期，避免午夜时间戳在 UTC 下前移一天。

## 本地网络与验证

配置 VPS 转发且 VPS 已部署 `/api/readings` 时，本机只需能访问 VPS。VPS 还没有这个接口、或未配置 VPS，读数在本机计算；本机无法直连 Yahoo 时，Node 需要在启动时启用用户提供的环境代理；例如：

```sh
HTTP_PROXY=http://127.0.0.1:10808 \
HTTPS_PROXY=http://127.0.0.1:10808 \
NO_PROXY=localhost,127.0.0.1 \
NODE_USE_ENV_PROXY=1 npm run dev -- --host 127.0.0.1
```

代理地址是本机配置，不写入应用代码或构建产物。部署环境仍需能访问所选来源；不可达时按单来源缺失处理。Node 环境代理的版本要求见 [Node 官方文档](https://nodejs.org/api/cli.html#node_use_env_proxy1)。

- `npm run typecheck`、`npm test`、`npm run build` 验证类型、边界解析和生产构建。
- `npm run smoke:market` 拦截 `/api/readings` 返回合成快照，覆盖开页即有数字、键盘页签、缺失数据、零百分位、失败重试、图表状态保留和 390px 布局。
- 原有 `npm run smoke` 涉及发布与回滚，应对独立内存布局服务运行，避免写入实际 Published Layout。
