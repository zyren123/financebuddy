# 0004 · 行情共享缓存放 VPS,平台函数只转发

ADR-0001 的目标是"每天每 symbol 只耗一次",但它的缓存是函数进程内 `Map`:Vercel serverless 与 EdgeOne 边缘实例互不共享、随时回收,增量请求带各人不同的 `start_date`,key 也对不上。实际只有浏览器 IndexedDB 在省额度,每个新访客首次进入 = 每张 Ticker 卡 1 credit。

决定:在 VPS 上跑一个长驻缓存服务(`vps/td-cache` + Redis,1Panel OpenResty 反代 HTTPS)。每个 symbol+interval 每 6h 向 Twelve Data 拉一次全量(`outputsize=5000`)存为快照,所有请求(全量与增量)都从快照切片返回,切片复刻上游语义(`start_date` 含、`end_date` 不含,先过滤再保留最新 `outputsize` 根)。上游失败时回旧快照。核心在 `server/tdCache.ts`,存储经 `SnapshotStore` 注入。

Vercel / EdgeOne 的 `/api/td` 在配了 `TD_CACHE_URL` + `TD_CACHE_TOKEN` 时改为转发到 VPS,口令走请求头、API key 只在 VPS;未配置时退回 ADR-0001 的直连,两种模式由 `server/tdProxy.ts` 的 `Upstream` 判别联合表达。

Published Layout(ADR-0003)也存到 VPS 的 Redis,由同一服务的 `/api/layout` 提供,核心仍是 `server/layoutApi.ts`。转发模式下两个平台和 VPS 备用前端共用一份布局,Admin 在任一处发布都全局生效;平台侧不再需要 Upstash / EdgeOne KV 与 `ADMIN_TOKEN`,Admin 口令只在 VPS 校验。平台转发统一在 `server/vpsRelay.ts`。

## Consequences

- 上游调用与访客数无关:第 2…N 个访客(含任意增量区间)上游 0 次。
- VPS 成为单点:它宕机时平台返回 502,浏览器 IndexedDB 里已有的 K 线照常展示,布局回落出厂版,Admin 暂时无法发布;删掉两个环境变量即回到直连与平台 KV。
- 从平台 KV 切到 VPS 时布局不会自动迁移:VPS 首次是"未发布"状态,要在 Admin 里重新发布一次(或先导出旧版再导入)。
- 平台→VPS 必须走 HTTPS:国内链路对明文 `*.duckdns.org` 请求会重置连接。
