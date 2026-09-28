# 0003 · 布局单一事实源移到服务端,仅 Admin 可编辑

v1 让每个访客在浏览器里持有一份可编辑的 Local Layout,Published Layout 只作首访默认。实测暴露结构性缺陷:react-grid-layout 挂载即触发 `onLayoutChange`,而 autosave 对任意 state 变化都写 Local,导致 Published Layout 在访客首次渲染时就被冻结成其 Local 副本,此后发布的新版对回访者永久失效(CONTEXT.md 承诺的"对所有访客生效"名存实亡)。决定:删除访客编辑与 Local Layout;布局唯一事实源移到服务端 KV;Admin 凭共享口令(平台环境变量)进入 Edit Mode,改动存会话级 Draft,点 Publish 经服务端校验(口令 + 布局校验器)后写入,旧版自动保留为上一版可回滚;仓库捆绑的 `default-dashboard.json` 降级为 Factory Layout 兜底。读取链:服务端 Published → Factory 兜底;key 带命名空间(`layout:published`),为将来多账号在链头插入 `layout:user:<id>` 留好插入点。

## Considered Options

- **访客可编辑的 Local Layout(v1 现状,拒绝)**:双事实源必然带来同步 bug;对"读者"定位的访客是无人需要的推测性功能。
- **只收权限、维持导出→部署发布流(拒绝)**:零后端改动,但每次改布局要走 git 与部署,与"编辑即对所有人生效"的意图不符。
- **现在就上账号体系(拒绝)**:YAGNI;读取链与命名空间已为升级留好插入点,将来只需在链头加一层。

## Consequences

- 运行时新增布局读写端点;写端点逐次校验口令与 `validateDashboardState`(脏边界从"导入文件"移到公开写 API,校验必须服务端);
- 双平台各一个 KV adapter(EdgeOne Pages 内置 KV / Vercel 经 Marketplace 用 Upstash),与 tdProxy 同构:共享核心 + 薄 adapter;
- EdgeOne KV 最终一致性约 60s:发布不承诺全球即时,Admin 端乐观渲染;
- 访客的 Browse State(时间区间等)为会话内存,不再触碰布局;smoke 的访客编辑流断言改为 Admin 流(带口令);
- 耐久与备份:KV 为平台托管持久存储,重新部署不丢;终极备份走「导出 JSON → 提交仓库 default-dashboard.json」,让 Factory Layout 随部署保持最新(KV 整体丢失亦可从部署恢复);
- ADR-0001 的"应用本体是纯静态 SPA"前提放宽一步(新增布局端点);Twelve Data 代理本身保持薄,不受影响。
