# VPS 部署:行情共享缓存 + 布局存储 + 备用前端

设计见 `docs/adr/0004-shared-td-cache-on-vps.md`。三个容器:`redis`(仅容器内网)、`td-cache`(`127.0.0.1:8787`)、`web`(备用前端,`127.0.0.1:8788`)。HTTPS 由 1Panel 的 OpenResty 反代负责。

## 部署与自检

两个脚本都从本机运行,默认连 `ubuntu@140.245.103.19`,可用环境变量 `VPS_HOST` 覆盖。

- `vps/scripts/deploy.sh` 把当前检出同步到 VPS 的 `~/financebuddy`,然后重建容器。首次部署时它创建 `vps/.env`(权限 600),Twelve Data key 取自本地 `.env` 的 `API_KEY`,`TD_CACHE_TOKEN` 与 `ADMIN_TOKEN` 在 VPS 上随机生成。之后再运行会保留已有口令。
- `node vps/scripts/verify.mjs` 检查容器、Redis、本机端口和公网 HTTPS 反代,任一项失败时退出码非 0。它只请求 CGDV 一个标的,快照有效期内不消耗 Twelve Data credit。

`vps/.env` 的变量:

```
TWELVEDATA_API_KEY=<Twelve Data key>
TD_CACHE_TOKEN=<与平台环境变量一致>
ADMIN_TOKEN=<Admin 发布口令>
```

## 1Panel 反代站点

在 1Panel 建两个反代站点,并申请 Let's Encrypt 证书:

- `api.zenode.duckdns.org` 反代到 `http://127.0.0.1:8787`。
- `fb.zenode.duckdns.org` 反代到 `http://127.0.0.1:8788`(备用前端,可选)。

后端代理地址的协议必须选 `http`。容器只提供明文 HTTP,HTTPS 由 OpenResty 在外层终止。选了 `https` 时,OpenResty 错误日志会出现 `SSL_do_handshake() failed ... wrong version number`,公网返回 502。`panel` 站点的后端用 `https`,是因为 1Panel 面板本身监听 HTTPS,两者不要照抄。

## 让 Vercel / EdgeOne 走 VPS

两个平台的环境变量都加上:

- `TD_CACHE_URL=https://api.zenode.duckdns.org`
- `TD_CACHE_TOKEN=<同上>`

然后重新部署。`/api/td` 与 `/api/layout` 都会转发到 VPS,Admin 登录用 VPS 上的 `ADMIN_TOKEN`。首次切换后布局是"未发布",在 Admin 里发布一次即可。删掉这两个变量即回到直连 Twelve Data 与平台 KV(仍需 `TWELVEDATA_API_KEY`、`ADMIN_TOKEN` 与 KV)。

## 运维

- 日志:`sudo docker compose logs -f td-cache`,每个请求一行 JSON,`outcome` 为 `hit` / `miss` / `stale` / `upstream-error`。
- 更新代码后运行 `vps/scripts/deploy.sh`,再运行 `node vps/scripts/verify.mjs`。Redis 数据在 `redis-data` 卷里,重建容器不丢。
- 布局存在同一个 Redis 的 `layout:published`(上一版在 `layout:published:prev`)。尚未发布时 `/api/layout` 返回 404,页面回落出厂布局 `public/default-dashboard.json`。
- 换 Admin 口令:改 `vps/.env` 的 `ADMIN_TOKEN` 后执行 `sudo docker compose up -d td-cache`。
