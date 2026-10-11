#!/bin/bash
# =============================================================
#  VTEC OS - Deploy para a VPS 179.199.143.217 (Hostinger)
#  Uso (no Mac, na pasta do projeto):  ./deploy.sh
#
#  O que ele faz:
#   1. Confere se a pasta está na versão mais nova do GitHub (main).
#   2. Compila do zero (apaga a .next antiga antes).
#   3. Junta tudo num único arquivo compactado, SEM o cache do build
#      (era ele que deixava o envio lento e travando).
#   4. Envia o arquivo (tenta de novo sozinho se a internet cair).
#   5. Na VPS: instala as dependências e troca a versão DE UMA VEZ
#      -- nunca fica metade nova, metade antiga.
#   6. Confere se o sistema respondeu. Se não subir, volta sozinho
#      para a versão anterior.
#
#  Opções:  ./deploy.sh --sem-git   (pula a conferência do GitHub)
# =============================================================

set -euo pipefail

VPS_HOST="root@179.199.143.217"
VPS_DIR="/root/vtec-os"
APP_NAME="vtec-os"
APP_PORT="3000"
PACKAGE="/tmp/vtec-os-deploy.tgz"
# Arquivos que vão para a VPS (a .next vai sem o cache).
FILES=(".next" "public" "package.json" "package-lock.json" "next.config.ts" "tsconfig.json" ".env.local")

CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo ""; echo -e "${CYAN}$1${NC}"; }
warn() { echo -e "${YELLOW}$1${NC}"; }
fail() { echo ""; echo -e "${RED}ERRO: $1${NC}"; exit 1; }
ask()  { local answer; read -r -p "$1 [s/N] " answer; [[ "$answer" =~ ^[sS]$ ]]; }

# Uma conexão SSH reaproveitada por todo o deploy (pede a senha uma vez só).
mkdir -p "$HOME/.ssh"
SSH_OPTS=(-o ControlMaster=auto -o ControlPath="$HOME/.ssh/vtec-deploy-%r@%h:%p" -o ControlPersist=120 -o ServerAliveInterval=15)
remote() { ssh "${SSH_OPTS[@]}" "$VPS_HOST" "$@"; }

cd "$(dirname "$0")"

# -- 1. Versão do código ---------------------------------------
log "[1/6] Conferindo a versão do código..."
if [[ "${1:-}" != "--sem-git" ]]; then
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$BRANCH" != "main" ]]; then
    warn "Você está na branch \"$BRANCH\", não na main."
    ask "Fazer o deploy desta branch mesmo assim?" || fail "Cancelado. Rode: git checkout main && git pull origin main"
  fi
  if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    warn "Há arquivos alterados na pasta (eles também vão no deploy):"
    git status --short --untracked-files=no
    ask "Continuar mesmo assim?" || fail "Cancelado."
  fi
  if git fetch -q origin main 2>/dev/null; then
    if [[ "$BRANCH" == "main" && "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
      if git merge-base --is-ancestor HEAD origin/main; then
        warn "Sua pasta está atrás do GitHub."
        if ask "Atualizar agora (git pull)?"; then
          git pull -q --ff-only origin main
        else
          fail "Cancelado. Rode: git pull origin main"
        fi
      fi
    fi
  else
    warn "Não consegui falar com o GitHub agora; seguindo com o código desta pasta."
  fi
fi
echo "  Versão: $(git log --oneline -1 2>/dev/null || echo 'sem git')"
[[ -f .env.local ]] || fail "Não achei o .env.local nesta pasta (é ele que tem as chaves do sistema)."

# -- 2. Build do zero ------------------------------------------
log "[2/6] Compilando do zero (pode levar alguns minutos)..."
rm -rf .next
npm run build
BUILD_ID="$(cat .next/BUILD_ID)"
echo "  Build: $BUILD_ID"

# -- 3. Pacote sem o cache -------------------------------------
log "[3/6] Montando o pacote (sem o cache do build)..."
rm -f "$PACKAGE"
COPYFILE_DISABLE=1 tar -czf "$PACKAGE" --exclude='.next/cache' --exclude='.next/dev' "${FILES[@]}"
echo "  Tamanho: $(du -h "$PACKAGE" | cut -f1)"

# -- 4. Envio --------------------------------------------------
log "[4/6] Enviando para a VPS..."
remote "mkdir -p $VPS_DIR"
sent=0
for attempt in 1 2 3; do
  if scp "${SSH_OPTS[@]}" "$PACKAGE" "$VPS_HOST:$VPS_DIR/.deploy.tgz"; then
    sent=1
    break
  fi
  warn "  O envio falhou (tentativa $attempt de 3). Tentando de novo em 5 segundos..."
  sleep 5
done
[[ "$sent" == 1 ]] || fail "Não consegui enviar o pacote. Confira a internet e rode ./deploy.sh de novo. O site continua na versão anterior."

# -- 5. Troca de versão na VPS ---------------------------------
log "[5/6] Instalando e trocando a versão na VPS..."
remote bash -s -- "$VPS_DIR" "$APP_NAME" "$APP_PORT" "$BUILD_ID" <<'REMOTE'
set -euo pipefail
VPS_DIR="$1"; APP_NAME="$2"; APP_PORT="$3"; BUILD_ID="$4"
cd "$VPS_DIR"
echo "--- Node $(node --version) / npm $(npm --version) ---"

# Abre o pacote numa pasta separada: o site atual continua no ar.
rm -rf .deploy-new
mkdir .deploy-new
tar -xzf .deploy.tgz -C .deploy-new --warning=no-unknown-keyword 2>/dev/null || tar -xzf .deploy.tgz -C .deploy-new
[ "$(cat .deploy-new/.next/BUILD_ID)" = "$BUILD_ID" ] || { echo "Pacote incompleto (BUILD_ID diferente)."; exit 1; }

# Dependências primeiro (com o package.json novo).
cp .deploy-new/package.json .deploy-new/package-lock.json .
echo "--- Instalando dependências de produção ---"
npm install --omit=dev --prefer-offline --no-audit --no-fund

# Troca de uma vez: guarda a versão atual para poder voltar.
rm -rf .next-old public-old
[ -d .next ] && mv .next .next-old
[ -d public ] && mv public public-old
mv .deploy-new/.next .next
mv .deploy-new/public public
cp .deploy-new/next.config.ts .deploy-new/tsconfig.json .deploy-new/.env.local .

restart() {
  if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
    pm2 restart "$APP_NAME" --update-env > /dev/null
  else
    pm2 start npm --name "$APP_NAME" -- start -- --port "$APP_PORT" > /dev/null
    pm2 save > /dev/null
  fi
}

healthy() {
  for _ in $(seq 1 30); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$APP_PORT/login" || true)"
    [ "$code" = "200" ] && return 0
    sleep 2
  done
  return 1
}

echo "--- Reiniciando o sistema ---"
restart
if healthy; then
  rm -rf .next-old public-old .deploy-new .deploy.tgz
  echo "Sistema no ar com a versão $BUILD_ID."
else
  echo "O sistema não respondeu. Voltando para a versão anterior..."
  if [ -d .next-old ]; then
    rm -rf .next public
    mv .next-old .next
    [ -d public-old ] && mv public-old public
    restart
  fi
  pm2 logs "$APP_NAME" --lines 30 --nostream || true
  exit 1
fi
REMOTE

# -- 6. Conferência --------------------------------------------
log "[6/6] Conferindo..."
REMOTE_ID="$(remote "cat $VPS_DIR/.next/BUILD_ID")"
remote "pm2 list"
rm -f "$PACKAGE"
if [[ "$REMOTE_ID" == "$BUILD_ID" ]]; then
  echo ""
  echo -e "${GREEN}Deploy concluído! Versão $BUILD_ID no ar.${NC}"
  echo -e "${GREEN}No navegador, recarregue com Cmd + Shift + R.${NC}"
else
  fail "A VPS está com a versão $REMOTE_ID, mas o build foi $BUILD_ID. Me mande o print desta tela."
fi
