# 构建上下文是仓库根(见 vps/docker-compose.yml)。共享核心沿用前端的无扩展名 import,
# Node 直接跑 TS 解析不了,所以先用 esbuild 打成单文件
FROM node:24-alpine AS build
WORKDIR /app/vps/td-cache
COPY vps/td-cache/package.json vps/td-cache/package-lock.json ./
RUN npm ci
COPY server /app/server
COPY src/dashboard /app/src/dashboard
COPY vps/td-cache/main.ts ./
RUN npx esbuild main.ts --bundle --platform=node --format=esm --target=node24 \
      --external:redis --outfile=dist/main.mjs

FROM node:24-alpine
WORKDIR /app
COPY vps/td-cache/package.json vps/td-cache/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/vps/td-cache/dist/main.mjs ./main.mjs
USER node
EXPOSE 8787
CMD ["node", "main.mjs"]
