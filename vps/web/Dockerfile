# VPS 备用前端:构建静态产物,nginx 托管并把 /api/td 转给 td-cache(口令在此注入,不进浏览器)
FROM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.29-alpine
COPY vps/web/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /src/dist /usr/share/nginx/html
