# FinanceBuddy

个人自用的美股行情仪表盘:Twelve Data API + TradingView 式观感。单用户、无登录。

术语表见 [`CONTEXT.md`](./CONTEXT.md),架构决策见 [`docs/adr/`](./docs/adr/)。

## 功能

- **三种卡片**:K 线卡(蜡烛 + 成交量)、Ratio ROC 卡(多条 `分子/分母` 比值的 N 日 ROC 同图,如 VTV/QQQ、SCHD/QQQ、CGDV/QQQ 的 ROC-35)、指标卡(RSI / ROC / SMA / EMA,参数可调)
- **可拖拽网格**:编辑模式下拖动换位、拉角调宽高;`E` 键或按钮切换编辑/浏览
- **两种预设**:四宫格 / 自上而下,一键重排
- **布局保护**:访客的修改只存自己浏览器的 Local Layout(localStorage),互相不影响;所有人默认看到 Published Layout
- 指标全部前端计算(ADR-0002),图表配色过 CVD 校验,十字线联动读数、6月/1年/3年/5年/全部 快捷切换

## 快速开始

```bash
cp .env.example .env   # 填入 Twelve Data API key(免费注册:https://twelvedata.com/)
npm install
npm run dev            # http://localhost:5173
```

key 只用于本地 dev proxy 转发,不进前端代码。

## 常用命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 开发服务器 |
| `npm run build` | 生产构建(dist/) |
| `npm run typecheck` | TypeScript 检查 |
| `npm test` | 单元测试(vitest) |
| `node scripts/smoke.mjs` | 端到端冒烟(需先 `npm run dev`;用系统 Chrome) |

## 架构速览

```
浏览器 SPA(React 19 + Vite + Tailwind + TanStack Query)
  └─ /api/td/time_series  ← 开发期:Vite dev proxy 注入 key
                            ← 生产期:api/td/[...route].ts(Vercel serverless,见 ADR-0001)
                                └─ api.twelvedata.com(6h 服务端共享缓存)
数据层:IndexedDB 全量缓存(1 credit ≈ 5000 根日 K)+ 每日增量 + 8 credits/min 限速队列
指标层:纯函数(ROC/RSI/SMA/EMA + 比值对齐),测试先行
```

免费配额(8 credits/分钟、800/天)下的用量:每 Ticker 首次 1 credit 拉全量,之后每天增量约 1-4 credits;多标的 dashboard 首屏会按限速分批点亮。

## 部署

### Vercel(已支持)

1. 导入仓库,框架自动识别为 Vite;
2. 环境变量设置 `TWELVEDATA_API_KEY`;
3. 部署。`api/td/[...route].ts` 自动成为 `/api/td/*` 的 serverless 代理。

### 腾讯 EdgeOne Pages(待办)

edge function 版代理尚未编写(等价于 `api/td/[...route].ts` 的 ~30 行 Web-fetch 处理器),确定使用该平台时补上。

## 更新全网默认布局(Published Layout)

1. 在站点里摆好布局 → 顶栏「导出布局」得到 JSON;
2. 用它覆盖 `public/default-dashboard.json` → 提交部署,对所有访客生效;
3. 访客随时可用「重置为默认」回到这份布局。
