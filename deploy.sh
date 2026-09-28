#!/bin/bash
# =============================================================
#  VTEC OS - Deploy Script para VPS 191.252.192.29
#  Versão macOS/Linux (bash) do deploy.ps1
#  Uso: ./deploy.sh
# =============================================================

set -e

VPS_HOST="root@191.252.192.29"
VPS_DIR="/root/vtec-os"
APP_NAME="vtec-os"

CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

log() {
  echo ""
  echo -e "${CYAN}$1${NC}"
}

# -- 1. Build local --------------------------------------------
log "[1/5] Buildando o projeto Next.js..."
npm run build

# -- 2. Preparar pasta na VPS ----------------------------------
log "[2/5] Preparando diretorio na VPS..."
ssh "$VPS_HOST" "mkdir -p $VPS_DIR"

# -- 3. Enviar arquivos ----------------------------------------
log "[3/5] Enviando arquivos para a VPS..."

FILES_TO_SEND=(".next" "public" "package.json" "package-lock.json" "next.config.ts" "tsconfig.json" ".env.local")

for item in "${FILES_TO_SEND[@]}"; do
  if [ -e "$item" ]; then
    echo "  -> Enviando: $item"
    scp -r "$item" "${VPS_HOST}:${VPS_DIR}/"
  else
    echo -e "  ${YELLOW}[AVISO] Nao encontrado: $item${NC}"
  fi
done

# -- 4. Instalar dependencias e reiniciar na VPS ----------------
log "[4/5] Instalando dependencias e reiniciando na VPS..."

ssh "$VPS_HOST" bash <<EOF
set -e
cd "$VPS_DIR"

echo "--- Versoes: Node=\$(node --version) NPM=\$(npm --version) ---"

echo "--- Instalando dependencias de producao ---"
npm install --omit=dev --prefer-offline

echo "--- Gerenciando PM2 ---"
if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
    pm2 restart "$APP_NAME" --update-env
    echo "App reiniciado com sucesso."
else
    pm2 start npm --name "$APP_NAME" -- start -- --port 3000
    pm2 save
    echo "App iniciado pela primeira vez."
fi
EOF

# -- 5. Verificar status ---------------------------------------
log "[5/5] Verificando status na VPS..."
ssh "$VPS_HOST" "pm2 list"

echo ""
echo -e "${GREEN}Deploy concluido! App rodando em http://191.252.192.29:3000${NC}"
