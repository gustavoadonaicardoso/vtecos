#!/usr/bin/env bash
# =============================================================
#  VTEC OS - Deploy para VPS (macOS / Linux)
#  Equivalente ao deploy.ps1, para rodar direto no Terminal.
#
#  Uso:
#    ./deploy.sh root@<IP_DA_VPS>
#    ./deploy.sh root@<IP_DA_VPS> --skip-build   # reenvia o último build
#
#  Dica: defina VTEC_VPS_HOST no ~/.zshrc para não precisar
#  passar o host toda vez:  export VTEC_VPS_HOST=root@<IP_DA_VPS>
#
#  Pré-requisito: servidor preparado com scripts/setup-vps.sh
# =============================================================
set -euo pipefail

VPS_HOST="${VTEC_VPS_HOST:-}"
SKIP_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    -*) echo "Opção desconhecida: $arg" >&2; exit 1 ;;
    *) VPS_HOST="$arg" ;;
  esac
done

VPS_DIR="/root/vtec-os"
APP_NAME="vtec-os"
PORT=3000

log() { printf '\n\033[1;36m%s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m[AVISO] %s\033[0m\n' "$1"; }
fail() { printf '\033[1;31m[ERRO] %s\033[0m\n' "$1" >&2; exit 1; }

cd "$(dirname "$0")"

[[ -n "$VPS_HOST" ]] || fail "Informe o servidor: ./deploy.sh root@<IP_DA_VPS>"

# -- 0. Verificações -------------------------------------------
[[ -f .env.local ]] || fail ".env.local não encontrado. As variáveis NEXT_PUBLIC_* precisam existir no momento do build."

grep -qE '^WHATSAPP_WEB_SESSION_PATH=/' .env.local \
  || warn "WHATSAPP_WEB_SESSION_PATH não aponta para um caminho absoluto. Recomendado: /var/lib/vtec/whatsapp-session"
if grep -qE '^NEXT_PUBLIC_APP_URL=http://localhost' .env.local; then
  warn "NEXT_PUBLIC_APP_URL ainda aponta para localhost. Webhooks e links gerados vão quebrar."
fi

# -- 1. Build local --------------------------------------------
if [[ $SKIP_BUILD -eq 1 ]]; then
  log "[1/5] Build pulado (--skip-build)."
  [[ -d .next ]] || fail "Nenhum build encontrado em .next"
else
  log "[1/5] Buildando o projeto Next.js..."
  npm run build
fi

# -- 2. Empacotar ----------------------------------------------
log "[2/5] Empacotando arquivos..."
ITEMS=(.next public package.json package-lock.json next.config.ts tsconfig.json .env.local)
for item in "${ITEMS[@]}"; do
  [[ -e "$item" ]] || fail "Arquivo não encontrado: $item"
done

ARCHIVE="$(mktemp "${TMPDIR:-/tmp}/vtec-deploy.XXXXXX")"
trap 'rm -f "$ARCHIVE"' EXIT
# COPYFILE_DISABLE evita que o tar do macOS inclua arquivos ._* (metadados)
COPYFILE_DISABLE=1 tar -czf "$ARCHIVE" --exclude=".next/cache" "${ITEMS[@]}"
echo "  -> Pacote: $(du -h "$ARCHIVE" | cut -f1)"

# -- 3. Enviar -------------------------------------------------
log "[3/5] Enviando para $VPS_HOST..."
ssh "$VPS_HOST" "mkdir -p $VPS_DIR" || fail "Não foi possível conectar em $VPS_HOST"
scp "$ARCHIVE" "$VPS_HOST:/tmp/vtec-deploy.tar.gz"

# -- 4. Instalar e reiniciar na VPS ----------------------------
log "[4/5] Instalando dependências e reiniciando na VPS..."
ssh "$VPS_HOST" "APP_DIR='$VPS_DIR' APP_NAME='$APP_NAME' PORT='$PORT' bash -s" <<'REMOTE'
set -e
cd "$APP_DIR"
echo "--- Versões: Node=$(node --version) NPM=$(npm --version) ---"

echo "--- Extraindo pacote ---"
rm -rf .next
tar --warning=no-unknown-keyword -xzf /tmp/vtec-deploy.tar.gz -C "$APP_DIR"
rm -f /tmp/vtec-deploy.tar.gz
chmod 600 .env.local

SESSION_PATH="$(grep -E '^WHATSAPP_WEB_SESSION_PATH=' .env.local | cut -d= -f2- | tr -d "\"'\r" || true)"
if [ -n "$SESSION_PATH" ]; then mkdir -p "$SESSION_PATH"; fi

echo "--- Instalando dependências de produção ---"
npm ci --omit=dev --no-audit --no-fund

echo "--- Gerenciando PM2 ---"
if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
    pm2 restart "$APP_NAME" --update-env
    echo "App reiniciado com sucesso."
else
    pm2 start npm --name "$APP_NAME" --cwd "$APP_DIR" --max-memory-restart 1500M -- start -- --port "$PORT"
    echo "App iniciado pela primeira vez."
fi
pm2 save

echo "--- Health check ---"
for i in $(seq 1 20); do
    if curl -fsS -o /dev/null "http://127.0.0.1:$PORT" 2>/dev/null; then
        echo "App respondendo na porta $PORT."
        exit 0
    fi
    sleep 2
done
echo "App não respondeu em 40s. Últimos logs:"
pm2 logs "$APP_NAME" --lines 40 --nostream
exit 1
REMOTE

# -- 5. Verificar status ---------------------------------------
log "[5/5] Status na VPS..."
ssh "$VPS_HOST" "pm2 list"

printf '\n\033[1;32mDeploy concluído!\033[0m\n'
