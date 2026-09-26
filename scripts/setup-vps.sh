#!/usr/bin/env bash
# =============================================================
#  VTEC OS - Setup inicial de VPS (Hostinger KVM / Ubuntu 24.04)
#
#  Prepara um servidor Ubuntu zerado para rodar o VTEC OS:
#  Node.js LTS, PM2, Nginx (proxy reverso), HTTPS (Let's Encrypt),
#  firewall, fail2ban, swap, diretórios persistentes e backup
#  diário do banco Supabase (pg_dump).
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
BACKUP_DIR="/var/backups/vtec-db"
BACKUP_ENV="/etc/vtec/backup.env"
PG_CLIENT_MAJOR=17
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
log "[1/9] Atualizando o sistema e instalando pacotes básicos..."
apt-get update -y
apt-get upgrade -y
apt-get install -y curl ca-certificates gnupg ufw fail2ban git tar dnsutils
timedatectl set-timezone America/Sao_Paulo || true

# -- 2. Swap ---------------------------------------------------
# O `next build` e o Baileys consomem bastante RAM; swap evita OOM em planos menores.
log "[2/9] Configurando swap..."
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
log "[3/9] Configurando firewall (SSH, HTTP, HTTPS)..."
ufw allow OpenSSH
ufw allow 'Nginx Full' 2>/dev/null || { ufw allow 80/tcp; ufw allow 443/tcp; }
ufw --force enable
systemctl enable --now fail2ban

# -- 4. Node.js ------------------------------------------------
log "[4/9] Instalando Node.js ${NODE_MAJOR} LTS..."
CURRENT_NODE_MAJOR="$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || echo 0)"
if [[ "$CURRENT_NODE_MAJOR" -ge "$NODE_MAJOR" ]]; then
  echo "Node $(node -v) já instalado."
else
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
echo "Node: $(node -v) | npm: $(npm -v)"

# -- 5. PM2 ----------------------------------------------------
log "[5/9] Instalando PM2 e rotação de logs..."
npm install -g pm2
pm2 install pm2-logrotate >/dev/null
pm2 set pm2-logrotate:max_size 20M >/dev/null
pm2 set pm2-logrotate:retain 10 >/dev/null
pm2 startup systemd -u root --hp /root >/dev/null
systemctl enable pm2-root >/dev/null 2>&1 || true

# -- 6. Diretórios ---------------------------------------------
log "[6/9] Criando diretórios da aplicação..."
mkdir -p "$APP_DIR" "$SESSION_DIR"
chmod 700 "$SESSION_DIR"
echo "App:              $APP_DIR"
echo "Sessão WhatsApp:  $SESSION_DIR  (fora do diretório do app, sobrevive aos deploys)"

# -- 7. Nginx --------------------------------------------------
log "[7/9] Configurando Nginx como proxy reverso..."
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
log "[8/9] HTTPS (Let's Encrypt)..."
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

# -- 9. Backup diário do banco (Supabase) ----------------------
log "[9/9] Configurando backup diário do banco Supabase..."

# pg_dump precisa ser da mesma versão do Postgres do Supabase ou mais novo;
# o Ubuntu traz uma versão antiga, então usamos o repositório oficial (PGDG).
if ! command -v "/usr/lib/postgresql/${PG_CLIENT_MAJOR}/bin/pg_dump" >/dev/null 2>&1; then
  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
  . /etc/os-release
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
  apt-get update -y
  apt-get install -y "postgresql-client-${PG_CLIENT_MAJOR}"
fi

mkdir -p "$BACKUP_DIR" "$(dirname "$BACKUP_ENV")"
chmod 700 "$BACKUP_DIR" "$(dirname "$BACKUP_ENV")"

if [[ ! -f "$BACKUP_ENV" ]]; then
  cat > "$BACKUP_ENV" <<'ENVFILE'
# Connection string do banco Supabase, usada APENAS pelo backup.
# Supabase > Project Settings > Database > Connection string
#   > aba "Session pooler" (funciona em IPv4; porta 5432)
# Exemplo:
#   SUPABASE_DB_URL=postgresql://postgres.xxxxxxxx:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
# Se a senha tiver caracteres especiais (@ : / ? # %), codifique-os (ex.: @ -> %40).
SUPABASE_DB_URL=

# Quantos dias de backup manter
RETENTION_DAYS=14
ENVFILE
fi
chmod 600 "$BACKUP_ENV"

cat > /usr/local/bin/vtec-db-backup <<SCRIPT
#!/usr/bin/env bash
# Backup do banco Supabase do VTEC OS. Roda diariamente via cron
# (/etc/cron.d/vtec-db-backup) e pode ser executado manualmente.
#
# Gera dois arquivos por dia em ${BACKUP_DIR}:
#   public-<data>.dump       tabelas do sistema (leads, pipeline, chat...)
#   auth-storage-<data>.dump usuários (auth) e metadados de arquivos (storage)
#
# Restaurar (exemplo):
#   pg_restore --no-owner --no-privileges -d "\$SUPABASE_DB_URL" public-<data>.dump
set -euo pipefail

PATH="/usr/lib/postgresql/${PG_CLIENT_MAJOR}/bin:\$PATH"
BACKUP_DIR="${BACKUP_DIR}"
RETENTION_DAYS=14
source "${BACKUP_ENV}"

if [[ -z "\${SUPABASE_DB_URL:-}" ]]; then
  echo "\$(date '+%F %T') ERRO: SUPABASE_DB_URL vazio em ${BACKUP_ENV}" >&2
  exit 1
fi

STAMP="\$(date +%Y-%m-%d_%H%M)"
umask 077

dump() {
  local name="\$1"; shift
  local file="\$BACKUP_DIR/\$name-\$STAMP.dump"
  if pg_dump "\$SUPABASE_DB_URL" --format=custom --no-owner --no-privileges "\$@" -f "\$file.tmp" \\
     && pg_restore --list "\$file.tmp" >/dev/null; then
    mv "\$file.tmp" "\$file"
    echo "\$(date '+%F %T') OK   \$file (\$(du -h "\$file" | cut -f1))"
  else
    rm -f "\$file.tmp"
    echo "\$(date '+%F %T') ERRO ao gerar \$name" >&2
    return 1
  fi
}

status=0
dump public --schema=public || status=1
# auth/storage pertencem a roles internas do Supabase; se o acesso for negado
# o backup do schema public continua valendo.
dump auth-storage --schema=auth --schema=storage --data-only || status=1

find "\$BACKUP_DIR" -name '*.dump' -mtime +"\$RETENTION_DAYS" -delete
exit \$status
SCRIPT
chmod 700 /usr/local/bin/vtec-db-backup

cat > /etc/cron.d/vtec-db-backup <<'CRON'
# Backup diário do banco Supabase às 03:17 (horário de São Paulo)
17 3 * * * root /usr/local/bin/vtec-db-backup >> /var/log/vtec-db-backup.log 2>&1
CRON
chmod 644 /etc/cron.d/vtec-db-backup

cat > /etc/logrotate.d/vtec-db-backup <<'LOGROTATE'
/var/log/vtec-db-backup.log {
    monthly
    rotate 6
    compress
    missingok
    notifempty
}
LOGROTATE

if grep -qE '^SUPABASE_DB_URL=.+' "$BACKUP_ENV"; then
  echo "Testando backup..."
  /usr/local/bin/vtec-db-backup || warn "O backup falhou. Veja a mensagem acima e confira $BACKUP_ENV."
else
  warn "Backup instalado, mas falta a connection string do banco."
  warn "Edite $BACKUP_ENV (nano $BACKUP_ENV) e teste com: vtec-db-backup"
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
  4. Backup do banco: preencha SUPABASE_DB_URL em ${BACKUP_ENV}
     e teste com: vtec-db-backup   (arquivos em ${BACKUP_DIR})
=============================================================
EOF
