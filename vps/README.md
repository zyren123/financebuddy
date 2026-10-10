# VPS 部署:行情共享缓存 + 备用前端

设计见 `docs/adr/0004-shared-td-cache-on-vps.md`。三个容器:`redis`(仅容器内网)、`td-cache`(`127.0.0.1:8787`)、`web`(备用前端,`127.0.0.1:8788`)。HTTPS 由 1Panel 的 OpenResty 反代负责。

## 首次部署

1. 把仓库同步到 VPS 的 `~/financebuddy`。
2. 创建 `~/financebuddy/vps/.env`,权限 600:

   ```
   TWELVEDATA_API_KEY=<Twelve Data key>
   TD_CACHE_TOKEN=<随机长口令,与平台环境变量一致>
   ```

3. 在 `~/financebuddy/vps` 运行 `sudo docker compose up -d --build`。
4. 在 1Panel 建两个反代站点并申请 Let's Encrypt 证书:
   - `api.zenode.duckdns.org` 反代到 `http://127.0.0.1:8787`。
   - `fb.zenode.duckdns.org` 反代到 `http://127.0.0.1:8788`(备用前端,可选)。
5. 验证:`curl https://api.zenode.duckdns.org/healthz` 返回 `{"ok":true}`;不带口令请求 `/api/td` 返回 401。

## 让 Vercel / EdgeOne 走缓存

两个平台的环境变量都加上:

- `TD_CACHE_URL=https://api.zenode.duckdns.org`
- `TD_CACHE_TOKEN=<同上>`

然后重新部署。删掉这两个变量即回到直连 Twelve Data(仍需 `TWELVEDATA_API_KEY`)。

## 运维

- 日志:`sudo docker compose logs -f td-cache`,每个请求一行 JSON,`outcome` 为 `hit` / `miss` / `stale` / `upstream-error`。
- 更新代码后重新执行第 3 步。Redis 数据在 `redis-data` 卷里,重建容器不丢。
- 备用前端没有布局接口,`/api/layout` 返回 404,页面回落出厂布局 `public/default-dashboard.json`,Admin 发布在这里不可用。
