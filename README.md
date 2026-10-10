# FinanceBuddy

个人自用的美股行情仪表盘:Twelve Data API + TradingView 式观感。访客只读;Admin 凭口令编辑并发布布局,对所有访客生效(ADR-0003)。

术语表见 [`CONTEXT.md`](./CONTEXT.md),架构决策见 [`docs/adr/`](./docs/adr/)。

## 功能

- **三种卡片**:K 线卡(蜡烛 + 成交量)、Ratio ROC 卡(多条 `分子/分母` 比值的 N 日 ROC 同图,如 VTV/QQQ、SCHD/QQQ、CGDV/QQQ 的 ROC-35)、指标卡(RSI / ROC / SMA / EMA,参数可调)
- **单一事实源布局**:Admin 经 `#admin` 输口令登录 → `E` 进入编辑(改动存会话级草稿)→ 点「发布」写入服务端 KV,对所有访客生效;旧版自动保留,可「恢复上一版」;访客始终只读
- **可拖拽网格**:编辑模式下拖动换位、拉角调宽高;四宫格 / 自上而下两种预设一键重排
- **Browse State**:访客点时间区间(6月/1年/…)只是会话内偏好,刷新即回,不属于布局
- 指标全部前端计算(ADR-0002),图表配色过 CVD 校验,十字线联动读数

## 快速开始

```bash
cp .env.example .env   # 填入 Twelve Data API key(免费注册:https://twelvedata.com/)
npm install
npm run dev            # http://localhost:5173,Admin 口令缺省 dev-admin-token
```

key 只用于本地 dev proxy 转发,不进前端代码。

## 常用命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 开发服务器 |
| `npm run build` | 生产构建(dist/) |
| `npm run typecheck` | TypeScript 检查 |
| `npm test` | 单元测试(vitest) |
| `npm run smoke` | 端到端冒烟(需先 `npm run dev`;用系统 Chrome;env `ADMIN_TOKEN` 可覆盖 dev 缺省口令) |

## 架构速览

```
浏览器 SPA(React 19 + Vite + Tailwind + TanStack Query)
  ├─ GET /api/td?endpoint=time_series&…  → 十二数据代理
  │    ├─ 开发期:Vite 中间件直接运行共享核心(白名单/缓存全同构)
  │    ├─ Vercel:api/td.ts        ─┐ 各 ~20 行适配器
  │    └─ EdgeOne:functions/api/td/index.ts ─┘
  │         └─ server/tdProxy.ts(共享核心:白名单、6h 共享缓存、key 注入)
  │             └─ api.twelvedata.com
  └─ /api/layout  → 布局读写(ADR-0003:服务端单一事实源)
       ├─ GET(公开):KV 的 Published → 404 时客户端回落 Factory Layout(default-dashboard.json)
       ├─ PUT/POST(x-admin-token):发布 / verify / 恢复上一版,服务端校验 schema
       └─ LayoutStore adapter:Vercel=Upstash REST(api/layout.ts)、EdgeOne=KV 绑定(functions/api/layout)、
            dev=内存+出厂播种(vite 中间件);共享核心在 server/layoutApi.ts
数据层:IndexedDB 全量缓存(1 credit ≈ 5000 根日 K)+ 每日增量 + 8 credits/min 限速队列
指标层:纯函数(ROC/RSI/SMA/EMA + 比值对齐),测试先行
```

免费配额(8 credits/分钟、800/天)下的用量:每 Ticker 首次 1 credit 拉全量,之后每天增量约 1-4 credits;多标的 dashboard 首屏会按限速分批点亮。

## 部署

两平台共用同一路由与同一核心;除 `TWELVEDATA_API_KEY` 外,布局端点各需一个 KV 与 `ADMIN_TOKEN`(设强口令)。

### Vercel

1. 导入仓库,框架自动识别为 Vite;
2. Marketplace 安装 **Upstash Redis**(免费档足够),环境变量自动注入 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`;
3. 环境变量设置 `TWELVEDATA_API_KEY` 与 `ADMIN_TOKEN`;
4. 部署。`api/td.ts`、`api/layout.ts` 自动成为对应 serverless 端点。

### 行情共享缓存(可选,推荐)

平台函数的进程内缓存跨实例不共享,每个新访客都会消耗额度。在两个平台的环境变量里再设 `TD_CACHE_URL` 与 `TD_CACHE_TOKEN`,`/api/td` 就改为转发到 VPS 上的共享缓存(ADR-0004,部署见 `vps/README.md`);不设则直连 Twelve Data。

### 腾讯 EdgeOne Pages

1. 控制台创建项目并接入 Git 仓库(框架识别为 Vite);
2. 环境变量设置 `TWELVEDATA_API_KEY` 与 `ADMIN_TOKEN`;
3. 控制台创建 KV 命名空间,在函数设置里把绑定名设为 **`LAYOUT_KV`**;
4. 部署。`functions/api/td/index.ts`、`functions/api/layout/index.ts` 自动成为边缘函数(签名 `onRequest({ request, env })`,与官方模板一致)。
   注意:EdgeOne KV 最终一致性约 60s,发布后个别地区访客最迟一分钟内看到新版。

## 编辑与备份布局(Admin)

1. 打开 `#admin`(或问维护者要入口)→ 输口令登录 → `E` 编辑 → 「发布」即对所有访客生效;
2. 手滑了用「恢复上一版」(当前 Published 会成为新的上一版,可来回切);
3. **备份闭环(建议每次大改后)**:「导出布局」→ 覆盖仓库 `public/default-dashboard.json` → 提交部署。仓库里的 Factory Layout 永远是终极兜底——哪怕 KV 整个丢失,重新部署出来的也是最新版。
