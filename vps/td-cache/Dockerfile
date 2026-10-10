# 构建上下文是仓库根(见 vps/docker-compose.yml),以便带上共享核心 server/tdCache.ts
FROM node:24-alpine
WORKDIR /app/vps/td-cache
COPY vps/td-cache/package.json vps/td-cache/package-lock.json ./
RUN npm ci --omit=dev
COPY vps/td-cache/main.ts ./
COPY server/tdCache.ts /app/server/tdCache.ts
RUN echo '{"type":"module"}' > /app/package.json
USER node
EXPOSE 8787
CMD ["node", "main.ts"]
