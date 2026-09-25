# 0001 · Twelve Data 走薄代理,不前端直连

部署目标是 Vercel / 腾讯 EdgeOne Pages 等静态托管,Twelve Data 的 CORS 实测完全开放(`access-control-allow-origin: *`),纯前端直连技术上可行——但我们仍决定:应用本体是纯静态 SPA,另加每平台一个 ~30 行的转发函数(Vercel `/api`、EdgeOne edge function),API key 只存平台环境变量,函数内置"当日已拉取"缓存。理由:key 绝不进前端产物;共享缓存把配额消耗从"每访客每次"降到"每天每 symbol 一次",这直接决定免费档(8 credits/min、800/day)下 Dashboard 能摆多少张卡。

## Considered Options

- **纯前端直连**(拒绝):key 暴露在浏览器网络面板,且无法做多访客共享的服务端缓存。
