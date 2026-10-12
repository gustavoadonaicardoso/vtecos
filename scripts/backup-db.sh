#!/bin/bash
# =============================================================
#  VTEC OS - Backup diário do banco (roda NA VPS, pelo cron)
#
#  Copia o banco do Supabase (esquemas public e auth: dados das
#  empresas e logins) para /root/vtec-os-backups, fora do Supabase.
#  Guarda os últimos 14 dias + o primeiro backup de cada um dos
#  últimos 6 meses. O resultado fica em status.json, que o sistema
#  mostra em Painel Master > Status (e avisa no sino se falhar).
#
#  Precisa:
#   - SUPABASE_DB_URL no .env.local (Supabase > Connect > Session pooler)
#   - pg_dump 17 (instalado por ./backup.sh instalar, no Mac)
#
#  Uso manual na VPS:  /root/vtec-os/scripts/backup-db.sh
#  Restaurar: ver README > Backup do banco.
# =============================================================

set -uo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-$(cd "$APP_DIR/.." && pwd)/vtec-os-backups}"
KEEP_DAILY="${KEEP_DAILY:-14}"
KEEP_MONTHLY="${KEEP_MONTHLY:-6}"

umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
cd "$BACKUP_DIR" || exit 1

# Um backup por vez.
exec 9>"$BACKUP_DIR/.lock"
if ! flock -n 9; then
  echo "Já tem um backup rodando."
  exit 0
fi

# Valor de uma variável do .env.local (aspas e \r removidos).
env_value() {
  [ -f "$APP_DIR/.env.local" ] || return 0
  grep -E "^$1=" "$APP_DIR/.env.local" | tail -1 | cut -d= -f2- | tr -d '\r' | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

DB_URL="${SUPABASE_DB_URL:-$(env_value SUPABASE_DB_URL)}"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
START_S="$(date +%s)"

# status.json: o que o Painel Master > Status lê. Node escreve o JSON (escapa tudo certo).
write_status() {
  STATUS_OK="$1" STATUS_FILE_NAME="${2:-}" STATUS_BYTES="${3:-0}" STATUS_TABLES="${4:-0}" STATUS_ERROR="${5:-}" \
  STATUS_AT="$STARTED_AT" STATUS_SECONDS="$(( $(date +%s) - START_S ))" \
  STATUS_COUNT="$(ls -1 vtec-*.dump 2>/dev/null | wc -l | tr -d ' ')" \
  node -e '
    const fs = require("fs");
    const file = "status.json";
    let previous = {};
    try { previous = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
    const ok = process.env.STATUS_OK === "1";
    const status = {
      ok,
      at: process.env.STATUS_AT,
      seconds: Number(process.env.STATUS_SECONDS),
      file: ok ? process.env.STATUS_FILE_NAME : previous.lastOkFile || null,
      bytes: ok ? Number(process.env.STATUS_BYTES) : previous.lastOkBytes || 0,
      tables: ok ? Number(process.env.STATUS_TABLES) : previous.tables || 0,
      count: Number(process.env.STATUS_COUNT),
      error: ok ? null : process.env.STATUS_ERROR || "Erro desconhecido.",
      lastOkAt: ok ? process.env.STATUS_AT : previous.lastOkAt || null,
      lastOkFile: ok ? process.env.STATUS_FILE_NAME : previous.lastOkFile || null,
      lastOkBytes: ok ? Number(process.env.STATUS_BYTES) : previous.lastOkBytes || 0,
    };
    fs.writeFileSync(file + ".tmp", JSON.stringify(status, null, 2) + "\n");
    fs.renameSync(file + ".tmp", file);
  '
}

fail() {
  # Nunca deixa a senha do banco aparecer no erro.
  local message
  message="$(printf '%s' "$1" | sed -E 's#(postgres(ql)?://)[^@[:space:]]*@#\1***@#g' | tr '\n' ' ' | cut -c1-400)"
  echo "$(date '+%Y-%m-%d %H:%M:%S') ERRO: $message"
  rm -f .parcial.dump
  write_status 0 "" 0 0 "$message"
  exit 1
}

[ -n "$DB_URL" ] || fail "SUPABASE_DB_URL não está no .env.local (Supabase > Connect > Session pooler)."
command -v pg_dump > /dev/null || fail "pg_dump não está instalado na VPS. No Mac, rode: ./backup.sh instalar"

STAMP="$(TZ=America/Sao_Paulo date +%Y-%m-%d_%H%M)"
NAME="vtec-$STAMP.dump"

echo "$(date '+%Y-%m-%d %H:%M:%S') Começando o backup ($NAME)..."
rm -f .parcial.dump
if ! ERR="$(pg_dump "$DB_URL" --format=custom --compress=6 --no-owner \
    --schema=public --schema=auth --file=.parcial.dump 2>&1)"; then
  fail "pg_dump falhou: $(printf '%s' "$ERR" | tail -3)"
fi

# Confere se o arquivo abre e tem dados de tabelas.
TABLES="$(pg_restore --list .parcial.dump 2>/dev/null | grep -c 'TABLE DATA' || true)"
[ "${TABLES:-0}" -gt 0 ] || fail "O arquivo do backup saiu vazio ou corrompido."

mv .parcial.dump "$NAME"
BYTES="$(wc -c < "$NAME" | tr -d ' ')"

# Rotação: últimos KEEP_DAILY + o primeiro de cada um dos últimos KEEP_MONTHLY meses.
declare -A KEEP=()
mapfile -t NEWEST < <(ls -1 vtec-*.dump 2>/dev/null | sort -r | head -n "$KEEP_DAILY")
for f in "${NEWEST[@]}"; do KEEP["$f"]=1; done
MONTHLY=()
PREV_MONTH=""
while IFS= read -r f; do
  month="${f:5:7}"
  if [ "$month" != "$PREV_MONTH" ]; then MONTHLY+=("$f"); PREV_MONTH="$month"; fi
done < <(ls -1 vtec-*.dump 2>/dev/null | sort)
FIRST=$(( ${#MONTHLY[@]} > KEEP_MONTHLY ? ${#MONTHLY[@]} - KEEP_MONTHLY : 0 ))
for f in "${MONTHLY[@]:$FIRST}"; do KEEP["$f"]=1; done
for f in vtec-*.dump; do
  [ -e "$f" ] || continue
  [ -n "${KEEP[$f]:-}" ] || { rm -f "$f"; echo "  Apagado (antigo): $f"; }
done

write_status 1 "$NAME" "$BYTES" "$TABLES" ""
echo "$(date '+%Y-%m-%d %H:%M:%S') Backup pronto: $NAME ($(( BYTES / 1024 )) KB, $TABLES tabelas com dados)."
