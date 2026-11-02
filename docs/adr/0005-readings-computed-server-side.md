# 0005 · 读数在服务端算，图表仍在浏览器算

部分取代 ADR-0002 的"指标全部前端计算"。

2026-10-30 在线上用全新浏览器 profile 实测了 3 轮。HTML 约 2.2s 到达，180KB 的 JS 在 3.8-6.9s 到达并执行。`/api/layout` 与 4 个 `/api/td` 要等 JS 执行后才发出。每个请求经 Vercel sin1 转发到 VPS，等待 0.7-1.3s。封面数字在 6.2-10.0s 出现，美股指标点开页签后还要再等 0.6-1.2s，因为 5 个 feed 各发一个请求。Ratio ROC 三对在完整历史上只算 3ms，计算不是瓶颈。VPS 8 天日志显示：td 命中 p50 14ms；未命中要现场请求 Twelve Data，p50 1.1s、max 7.4s，占 349 次中的 81 次。慢在请求发得晚、发得多，每个请求都要付约 1s 往返。

决定：封面 Ratio 读数和美股指标的全部数字合成一个读数快照，由服务端算好，经固定 URL `GET /api/readings` 提供。`index.html` 用 `<link rel="preload" as="fetch">` 让它和 JS 并行下载。计算复用浏览器的同一份纯函数（`src/readings/compute.ts` 调 `src/indicators/ratio.ts` 与 `src/market/metrics.ts`）。快照的唯一所有者是 `server/readings.ts` 的 `createReadingsService`。VPS 启动时立即算一次，之后每 30 分钟一次；布局发布或恢复后立即重算。快照本身不持久化，它是 Redis 里 td 快照与 `market:*` 的纯函数。Twelve Data 的 credit 只经过 `server/credits.ts` 一个闸门（8/分钟、750/天），后台刷新与访客请求排同一个队。

图表仍在浏览器用完整 K 线计算（`ensureBars`，IndexedDB 6h 快照），不受影响。页面一打开就在后台预取所有卡片的 K 线；IndexedDB 里的最后一根比快照日期旧时主动刷新，图表与读数因此是同一天。

`/api/market` 及其 5 个 feed 请求全部删除。

## Consequences

- 首屏数字只依赖一个请求，并且这个请求不等 JS。响应带 `s-maxage=60`，平台边缘可直接回。
- 每项读数各自带状态与日期（`ready` / `unavailable{source-down|insufficient}`），某个来源挂了只影响那一项。
- Admin 编辑中的草稿口径和快照不同时，封面在浏览器本地算，这时才有"已读取 x/y"进度。发布后的几秒内，快照可能还是旧口径，也走本地计算。
- 未配置 VPS 时，平台进程内各自跑一份 service，按出厂口径计算，冷实例的第一个请求要等上游。这是应急模式。
- 部署必须先 VPS 后主站。如果主站先上线，`/api/readings` 会得到 404：封面回到本地计算，美股指标显示"来源暂不可用"。
