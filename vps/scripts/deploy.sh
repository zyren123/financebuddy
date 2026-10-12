#!/bin/bash
# 同步当前检出到 VPS 并重建容器。幂等:vps/.env 已存在时保留里面的口令,只补缺的 ADMIN_TOKEN。
# 首次部署从本地 .env 的 API_KEY 取 Twelve Data key,经 stdin 传过去,不进命令行参数,也不回显。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOST="${VPS_HOST:-ubuntu@140.245.103.19}"

rsync -az --delete \
  --exclude .git --exclude node_modules --exclude dist --exclude .claude --exclude .impeccable \
  --exclude .env --exclude 'vps/.env' \
  "$ROOT/" "$HOST:financebuddy/"

{ grep '^API_KEY=' "$ROOT/.env" 2>/dev/null | cut -d= -f2- || true; } | ssh "$HOST" '
  set -e
  cd ~/financebuddy/vps
  read -r key || true
  if [ ! -f .env ]; then
    [ -n "$key" ] || { echo "first deploy needs API_KEY in the local .env" >&2; exit 1; }
    umask 077
    printf "TWELVEDATA_API_KEY=%s\nTD_CACHE_TOKEN=%s\n" "$key" "$(openssl rand -hex 24)" > .env
    echo "created vps/.env"
  fi
  if ! grep -q "^ADMIN_TOKEN=" .env; then
    printf "ADMIN_TOKEN=%s\n" "$(openssl rand -hex 16)" >> .env
    echo "added ADMIN_TOKEN"
  fi
  echo "vps/.env keys: $(cut -d= -f1 .env | tr "\n" " ")"
'

ssh "$HOST" 'cd ~/financebuddy/vps && sudo docker compose up -d --build 2>&1 | tail -8 && sudo docker compose ps'
