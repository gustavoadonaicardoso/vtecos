#!/usr/bin/env bash
# =============================================================
#  VTEC OS - Setup inicial de VPS (Hostinger KVM / Ubuntu 24.04)
#
#  Prepara um servidor Ubuntu zerado para rodar o VTEC OS:
#  Node.js LTS, PM2, Nginx (proxy reverso), HTTPS (Let's Encrypt),
#  firewall, fail2ban, swap e diretórios persistentes.
#
#  Uso (como root, no servidor):
#    bash setup-vps.sh <dominio> <email-para-ssl>
#  Exemplo:
#    bash setup-vps.sh crm.vorticetecnologia.com.br contato@vorticetecnologia.com.br
#
#  Sem domínio ainda? Rode sem argumentos: o Nginx responde pelo IP
#  e o HTTPS pode ser ativado depois rodando o script de novo com o domínio.
#
#  O script é idempotente: pode ser executado mais de uma vez.
# =============================================================
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"

APP_NAME="vtec-os"
APP_DIR="/root/vtec-os"
APP_PORT=3000
SESSION_DIR="/var/lib/vtec/whatsapp-session"
NODE_MAJOR=22
SWAP_SIZE_GB=2
UPLOAD_LIMIT="25M"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m[AVISO] %s\033[0m\n' "$1"; }

if [[ $EUID -ne 0 ]]; then
  echo "Execute como root (ou com sudo)." >&2
  exit 1
fi

if [[ -n "$DOMAIN" && -z "$EMAIL" ]]; then
  echo "Informe também o e-mail para o certificado SSL: bash setup-vps.sh <dominio> <email>" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

# -- 1. Sistema -----------------------------------------------
log "[1/8] Atualizando o sistema e instalando pacotes básicos..."
apt-get update -y
apt-get upgrade -y
apt-get install -y curl ca-certificates gnupg ufw fail2ban git tar dnsutils
timedatectl set-timezone America/Sao_Paulo || true

# -- 2. Swap ---------------------------------------------------
# O `next build` e o Baileys consomem bastante RAM; swap evita OOM em planos menores.
log "[2/8] Configurando swap..."
if swapon --show | grep -q .; then
  echo "Swap já existe, mantendo."
else
  fallocate -l "${SWAP_SIZE_GB}G" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-vtec-swap.conf
  echo "Swap de ${SWAP_SIZE_GB}G criado."
fi

# -- 3. Firewall ----------------------------------------------
log "[3/8] Configurando firewall (SSH, HTTP, HTTPS)..."
ufw allow OpenSSH
ufw allow 'Nginx Full' 2>/dev/null || { ufw allow 80/tcp; ufw allow 443/tcp; }
ufw --force enable
systemctl enable --now fail2ban

# -- 4. Node.js ------------------------------------------------
log "[4/8] Instalando Node.js ${NODE_MAJOR} LTS..."
CURRENT_NODE_MAJOR="$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || echo 0)"
if [[ "$CURRENT_NODE_MAJOR" -ge "$NODE_MAJOR" ]]; then
  echo "Node $(node -v) já instalado."
else
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
echo "Node: $(node -v) | npm: $(npm -v)"

# -- 5. PM2 ----------------------------------------------------
log "[5/8] Instalando PM2 e rotação de logs..."
npm install -g pm2
pm2 install pm2-logrotate >/dev/null
pm2 set pm2-logrotate:max_size 20M >/dev/null
pm2 set pm2-logrotate:retain 10 >/dev/null
pm2 startup systemd -u root --hp /root >/dev/null
systemctl enable pm2-root >/dev/null 2>&1 || true

# -- 6. Diretórios ---------------------------------------------
log "[6/8] Criando diretórios da aplicação..."
mkdir -p "$APP_DIR" "$SESSION_DIR"
chmod 700 "$SESSION_DIR"
echo "App:              $APP_DIR"
echo "Sessão WhatsApp:  $SESSION_DIR  (fora do diretório do app, sobrevive aos deploys)"

# -- 7. Nginx --------------------------------------------------
log "[7/8] Configurando Nginx como proxy reverso..."
apt-get install -y nginx

SERVER_NAME="${DOMAIN:-_}"
cat > "/etc/nginx/sites-available/${APP_NAME}" <<NGINX
map \$http_upgrade \$connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${SERVER_NAME};

    # Uploads de planilhas (Disparos) e documentos (Fiscal)
    client_max_body_size ${UPLOAD_LIMIT};

    gzip on;
    gzip_types text/plain text/css application/json application/javascript image/svg+xml;

    # Assets estáticos do Next.js (hash no nome, podem ser cacheados)
    location /_next/static/ {
        proxy_pass http://127.0.0.1:${APP_PORT};
        expires 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location / {
        proxy_pass         http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection \$connection_upgrade;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
NGINX

ln -sf "/etc/nginx/sites-available/${APP_NAME}" "/etc/nginx/sites-enabled/${APP_NAME}"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl reload nginx || systemctl restart nginx

# -- 8. HTTPS --------------------------------------------------
log "[8/8] HTTPS (Let's Encrypt)..."
if [[ -z "$DOMAIN" ]]; then
  warn "Nenhum domínio informado; HTTPS não configurado."
  warn "Webhooks da Meta/Twilio exigem HTTPS. Rode de novo: bash setup-vps.sh <dominio> <email>"
else
  apt-get install -y certbot python3-certbot-nginx
  SERVER_IP="$(curl -fsS4 https://api.ipify.org || true)"
  DOMAIN_IP="$(dig +short A "$DOMAIN" | tail -n1)"
  if [[ -n "$SERVER_IP" && "$DOMAIN_IP" != "$SERVER_IP" ]]; then
    warn "O DNS de $DOMAIN aponta para '${DOMAIN_IP:-nada}', mas este servidor é $SERVER_IP."
    warn "Crie/ajuste o registro A e rode o script de novo quando o DNS propagar."
  else
    certbot --nginx -d "$DOMAIN" -m "$EMAIL" --agree-tos --non-interactive --redirect
    systemctl enable --now certbot.timer 2>/dev/null || true
  fi
fi

cat <<EOF

=============================================================
 Servidor pronto!

 Próximos passos:
  1. No .env.local (na sua máquina), defina:
       NEXT_PUBLIC_APP_URL=https://${DOMAIN:-SEU_DOMINIO}
       WHATSAPP_WEB_SESSION_PATH=${SESSION_DIR}
  2. Na sua máquina, rode o deploy:
       .\\deploy.ps1 -VpsHost root@<IP_DA_VPS>
  3. Atualize os webhooks (Meta / Twilio) e as URLs de Auth
     do Supabase para o novo domínio.
=============================================================
EOF
