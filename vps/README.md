# VPS 部署:行情共享缓存 + 美股指标 + 布局存储 + 备用前端

设计见 `docs/adr/0004-shared-td-cache-on-vps.md`。三个容器:`redis`(仅容器内网)、`td-cache`(`127.0.0.1:8787`)、`web`(备用前端,`127.0.0.1:8788`)。HTTPS 由 1Panel 的 OpenResty 反代负责。

## 镜像

`.github/workflows/images.yml` 在 master 每次推送后,用 arm64 runner 构建 `web` 与 `td-cache`,推到 `ghcr.io/zyren123/financebuddy-web`、`ghcr.io/zyren123/financebuddy-td-cache`,tag 为完整提交 SHA 与 `latest`。PR 上只构建不推送,用来提前发现 Dockerfile 坏掉。VPS 不需要源码,也不在上面编译。

GHCR 新包默认私有。第一次推送后到 GitHub 的 Packages 页把两个包设为 Public,VPS 就能匿名拉取;不想公开就在 VPS 上用只有 `read:packages` 权限的 token 执行一次 `docker login ghcr.io`。

## 部署

VPS 上的部署目录是 `~/financebuddy/vps`,只需要两个文件:`docker-compose.yml` 与 `.env`。本地修改须先提交并推送/合并到 `master`，等本次提交的 **Images** workflow 两个镜像都构建、推送成功，再在 VPS 更新。仅在 VPS 执行 pull 不会把未推送的本地代码打进镜像。

若 `.env` 设置了 `IMAGE_TAG`，先改为这次提交的完整 SHA；未设置时使用 `latest`。更新现有服务时先替换后端，再替换前端：

```bash
cd ~/financebuddy/vps
sudo docker compose pull td-cache web
sudo docker compose up -d --no-deps td-cache
curl -fsS --retry 10 --retry-connrefused --retry-delay 1 http://127.0.0.1:8787/healthz
sudo docker compose up -d --no-deps web
sudo docker compose ps
```

健康检查应返回 `{"ok":true}` 后再执行 `web` 更新；若失败，先查看后端日志并保留现有前端。

`docker-compose.yml` 改动时(很少),先从 GitHub 取最新版再执行上面两步:

```bash
curl -fsSL -o docker-compose.yml https://raw.githubusercontent.com/zyren123/financebuddy/master/vps/docker-compose.yml
```

回滚:在 `.env` 加 `IMAGE_TAG=<提交 SHA>`,再 `pull` + `up -d`;删掉这一行回到 `latest`。

compose 项目名在文件里固定为 `vps`,Redis 卷 `vps_redis-data` 不随目录变,重建容器不丢数据。

本次无需新增必填环境变量或修改 `docker-compose.yml`。后端镜像包含 `adjust=all` 支持和 `/api/market`；前端镜像包含移除前瞻 PE 的界面和新增的 nginx 指标路由。两者都必须更新。浏览器刷新后自动使用新复权缓存键。

通过备用前端检查两个接口：

```bash
curl -fsS 'http://127.0.0.1:8788/api/td?endpoint=time_series&symbol=QQQ&interval=1day&outputsize=1&adjust=all'
curl -fsS 'http://127.0.0.1:8788/api/market?feed=valuations'
```

第一条应返回 `status: "ok"` 的日线；第二条应返回 `feed: "valuations"` 与两个指数的 PE。备用前端 nginx 会在服务内部注入口令，浏览器和以上命令不需要持有口令。出现问题可查看 `sudo docker compose logs --tail=100 td-cache web`。

若主站托管在 Vercel / EdgeOne，先完成 VPS 后端更新，再部署同一提交的主站；VPS 的 `web` 更新仅影响备用前端。

### 首次部署

```bash
mkdir -p ~/financebuddy/vps && cd ~/financebuddy/vps
curl -fsSL -o docker-compose.yml https://raw.githubusercontent.com/zyren123/financebuddy/master/vps/docker-compose.yml
umask 077
printf 'TWELVEDATA_API_KEY=%s\nTD_CACHE_TOKEN=%s\nADMIN_TOKEN=%s\n' '<Twelve Data key>' "$(openssl rand -hex 24)" "$(openssl rand -hex 16)" > .env
sudo docker compose pull && sudo docker compose up -d
```

`.env` 的变量:

```
TWELVEDATA_API_KEY=<Twelve Data key>
TD_CACHE_TOKEN=<与平台环境变量一致>
ADMIN_TOKEN=<Admin 发布口令>
IMAGE_TAG=<可选,提交 SHA;不设为 latest>
```

## 自检

前复权版本需先更新 `td-cache` 再更新前端：浏览器新增 `adjust=all`，旧缓存服务会以 `parameter adjust not supported` 拒绝。新版按 symbol、interval、adjust 分开存储，不读取原来的无复权模式快照，无需清空 Redis。前端 IndexedDB 与内存查询键也区分新口径。开发期配置本机 `API_KEY` 时，Vite 会运行当前版本的内存行情缓存，布局仍按 `TD_CACHE_*` 转发到 VPS。

`VPS_HOST=<ssh 目标> node vps/scripts/verify.mjs` 从本机检查容器、Redis、本机端口和公网 HTTPS 反代,任一项失败时退出码非 0。`VPS_HOST` 建议用 `~/.ssh/config` 里的别名,服务器地址不写进仓库。它只请求 CGDV 一个标的,快照有效期内不消耗 Twelve Data credit。

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
- 布局存在同一个 Redis 的 `layout:published`(上一版在 `layout:published:prev`)。尚未发布时 `/api/layout` 返回 404,页面回落出厂布局 `public/default-dashboard.json`。
- 换 Admin 口令:改 `vps/.env` 的 `ADMIN_TOKEN` 后执行 `sudo docker compose up -d td-cache`。
