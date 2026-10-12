#!/bin/bash
# 在 VPS 上把 ~/financebuddy 切到 GitHub 上的某个提交并重建容器。用法:deploy.sh [ref],ref 默认 master,
# 可以是分支、tag 或完整 SHA。部署的是 origin 上的代码,与本机检出无关,未推送的改动不会上线。
# 幂等:vps/.env 被 .gitignore 忽略,切提交不动它;已存在时保留里面的口令,只补缺的 ADMIN_TOKEN。
# 首次部署从本地 .env 的 API_KEY 取 Twelve Data key,经 stdin 传过去,不进命令行参数,也不回显。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOST="${VPS_HOST:-ubuntu@140.245.103.19}"
REPO="${DEPLOY_REPO:-https://github.com/zyren123/financebuddy.git}"
REF="${1:-master}"
[[ "$REF" =~ ^[A-Za-z0-9._/-]+$ ]] || { echo "invalid ref: $REF" >&2; exit 1; }

# 目录不是 git 仓库时(首次部署或旧的 rsync 部署)原地 init;checkout -f 覆盖受跟踪文件,
# clean -fd 删掉不在该提交里的文件,但不加 -x,被忽略的 vps/.env 保留
ssh "$HOST" "
  set -e
  mkdir -p ~/financebuddy && cd ~/financebuddy
  [ -d .git ] || { git init -q && git remote add origin '$REPO'; }
  git fetch -q --depth 1 origin '$REF'
  git checkout -q -f --detach FETCH_HEAD
  git clean -q -fd
  echo \"deployed \$(git log -1 --format='%h %s')\"
"

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
