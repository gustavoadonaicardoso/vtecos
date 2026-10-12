#!/bin/bash
# =============================================================
#  VTEC OS - Backup do banco (rodar no Mac, na pasta do projeto)
#
#  ./backup.sh instalar   Prepara a VPS (uma vez): instala o pg_dump,
#                         liga o backup diário (03:17, horário de
#                         Brasília) e já faz o primeiro.
#  ./backup.sh agora      Faz um backup agora.
#  ./backup.sh listar     Mostra os backups guardados na VPS.
#  ./backup.sh baixar     Baixa o mais recente para ~/Backups/vtec-os
#                         (guarde também fora da VPS de vez em quando).
#
#  Precisa do SUPABASE_DB_URL no .env.local (ver README > Backup do banco).
# =============================================================

set -euo pipefail

VPS_HOST="${VPS_HOST:-root@179.199.143.217}"
VPS_DIR="${VPS_DIR:-/root/vtec-os}"
BACKUP_DIR="${BACKUP_DIR:-/root/vtec-os-backups}"
LOCAL_DIR="${LOCAL_DIR:-$HOME/Backups/vtec-os}"

CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo ""; echo -e "${CYAN}$1${NC}"; }
ok()   { echo -e "${GREEN}$1${NC}"; }
fail() { echo ""; echo -e "${RED}ERRO: $1${NC}"; exit 1; }

mkdir -p "$HOME/.ssh"
SSH_OPTS=(-o ControlMaster=auto -o ControlPath="$HOME/.ssh/vtec-deploy-%r@%h:%p" -o ControlPersist=120 -o ServerAliveInterval=15)
remote() { ssh "${SSH_OPTS[@]}" "$VPS_HOST" "$@"; }

cd "$(dirname "$0")"

show_status() {
  remote "cat $BACKUP_DIR/status.json 2>/dev/null" | node -e '
    let raw = ""; process.stdin.on("data", (c) => (raw += c)).on("end", () => {
      if (!raw.trim()) { console.log("Ainda não há backup na VPS."); process.exit(1); }
      const s = JSON.parse(raw);
      const when = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "nunca");
      const mb = (b) => (b / 1024 / 1024).toFixed(1).replace(".", ",") + " MB";
      if (s.ok) console.log(`\x1b[0;32mÚltimo backup OK: ${when(s.lastOkAt)} — ${s.lastOkFile} (${mb(s.lastOkBytes)}, ${s.tables} tabelas). Guardados: ${s.count}.\x1b[0m`);
      else { console.log(`\x1b[0;31mO último backup FALHOU (${when(s.at)}): ${s.error}\x1b[0m`); console.log(`Último bom: ${when(s.lastOkAt)}.`); process.exit(1); }
    });'
}

case "${1:-}" in
  instalar)
    [[ -f .env.local ]] || fail "Não achei o .env.local nesta pasta."
    grep -Eq '^SUPABASE_DB_URL=.+' .env.local || fail "Falta o SUPABASE_DB_URL no .env.local.
  No Supabase: botão Connect (topo) > aba Connection String > Session pooler.
  Copie o endereço, troque [YOUR-PASSWORD] pela senha do banco e cole no .env.local:
  SUPABASE_DB_URL=\"postgresql://postgres.xxxx:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres\""

    log "[1/4] Enviando o script de backup e o .env.local..."
    remote "mkdir -p $VPS_DIR/scripts"
    scp "${SSH_OPTS[@]}" -q scripts/backup-db.sh "$VPS_HOST:$VPS_DIR/scripts/backup-db.sh"
    scp "${SSH_OPTS[@]}" -q .env.local "$VPS_HOST:$VPS_DIR/.env.local"
    remote "chmod +x $VPS_DIR/scripts/backup-db.sh"

    log "[2/4] Instalando o pg_dump 17 na VPS (só na primeira vez)..."
    remote bash -s <<'REMOTE'
set -euo pipefail
major="$(pg_dump --version 2>/dev/null | grep -oE '[0-9]+' | head -1 || true)"
if [ "${major:-0}" -ge 17 ]; then
  echo "  pg_dump $major já instalado."
  exit 0
fi
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq postgresql-common > /dev/null
/usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y > /dev/null
apt-get install -y -qq postgresql-client-17 > /dev/null
echo "  $(pg_dump --version)"
REMOTE

    log "[3/4] Ligando o backup diário (03:17, horário de Brasília)..."
    remote bash -s -- "$VPS_DIR" "$BACKUP_DIR" <<'REMOTE'
set -euo pipefail
VPS_DIR="$1"; BACKUP_DIR="$2"
mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"
# O cron tem um PATH mínimo: inclui onde está o node (o pg_dump fica em /usr/bin).
NODE_DIR="$(dirname "$(command -v node)")"
# O cron usa o fuso da VPS: converte 03:17 de Brasília para ele.
HOUR="$(date -d 'TZ="America/Sao_Paulo" 03:17' +%-H)"
cat > /etc/cron.d/vtec-os-backup <<CRON
# VTEC OS: backup diário do banco às 03:17 de Brasília ($HOUR:17 no fuso da VPS). Criado por ./backup.sh instalar.
PATH=$NODE_DIR:/usr/local/bin:/usr/bin:/bin
17 $HOUR * * * root $VPS_DIR/scripts/backup-db.sh >> $BACKUP_DIR/backup.log 2>&1
CRON
chmod 644 /etc/cron.d/vtec-os-backup
echo "  Agendado: /etc/cron.d/vtec-os-backup"
REMOTE

    log "[4/4] Fazendo o primeiro backup..."
    remote "$VPS_DIR/scripts/backup-db.sh 2>&1 | tail -3" || true
    show_status || fail "O backup não funcionou. Confira o SUPABASE_DB_URL (senha e endereço do Session pooler) e rode ./backup.sh agora."
    echo ""
    ok "Pronto. Rode ./deploy.sh uma vez para o Painel Master > Status mostrar o backup."
    ;;

  agora)
    log "Fazendo um backup agora..."
    remote "$VPS_DIR/scripts/backup-db.sh 2>&1 | tail -3" || true
    show_status
    ;;

  listar)
    show_status || true
    log "Backups guardados na VPS ($BACKUP_DIR):"
    remote "cd $BACKUP_DIR 2>/dev/null && ls -lh vtec-*.dump 2>/dev/null | awk '{print \"  \" \$9 \"   \" \$5}'" || echo "  Nenhum."
    ;;

  baixar)
    name="$(remote "ls -1 $BACKUP_DIR/vtec-*.dump 2>/dev/null | sort | tail -1")"
    [[ -n "$name" ]] || fail "Ainda não há backup na VPS. Rode ./backup.sh instalar."
    mkdir -p "$LOCAL_DIR"
    chmod 700 "$LOCAL_DIR"
    log "Baixando $(basename "$name")..."
    scp "${SSH_OPTS[@]}" "$VPS_HOST:$name" "$LOCAL_DIR/"
    chmod 600 "$LOCAL_DIR/$(basename "$name")"
    ok "Salvo em $LOCAL_DIR/$(basename "$name")"
    echo "Tem dados dos clientes (CPF, telefones): guarde em lugar seguro."
    ;;

  *)
    echo "Uso: ./backup.sh instalar | agora | listar | baixar"
    exit 1
    ;;
esac
