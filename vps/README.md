# VPS 部署:行情共享缓存 + 布局存储 + 备用前端

设计见 `docs/adr/0004-shared-td-cache-on-vps.md`。三个容器:`redis`(仅容器内网)、`td-cache`(`127.0.0.1:8787`)、`web`(备用前端,`127.0.0.1:8788`)。HTTPS 由 1Panel 的 OpenResty 反代负责。

## 镜像

`.github/workflows/images.yml` 在 master 每次推送后,用 arm64 runner 构建 `web` 与 `td-cache`,推到 `ghcr.io/zyren123/financebuddy-web`、`ghcr.io/zyren123/financebuddy-td-cache`,tag 为完整提交 SHA 与 `latest`。PR 上只构建不推送,用来提前发现 Dockerfile 坏掉。VPS 不需要源码,也不在上面编译。

GHCR 新包默认私有。第一次推送后到 GitHub 的 Packages 页把两个包设为 Public,VPS 就能匿名拉取;不想公开就在 VPS 上用只有 `read:packages` 权限的 token 执行一次 `docker login ghcr.io`。

## 部署

VPS 上的部署目录是 `~/financebuddy/vps`,只需要两个文件:`docker-compose.yml` 与 `.env`。上线是手动的,确认 Images workflow 在 master 上跑完后,在 VPS 上:

```bash
cd ~/financebuddy/vps
sudo docker compose pull
sudo docker compose up -d
```

`docker-compose.yml` 改动时(很少),先从 GitHub 取最新版再执行上面两步:

```bash
curl -fsSL -o docker-compose.yml https://raw.githubusercontent.com/zyren123/financebuddy/master/vps/docker-compose.yml
```

回滚:在 `.env` 加 `IMAGE_TAG=<提交 SHA>`,再 `pull` + `up -d`;删掉这一行回到 `latest`。

compose 项目名在文件里固定为 `vps`,Redis 卷 `vps_redis-data` 不随目录变,重建容器不丢数据。

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
