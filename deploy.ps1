# =============================================================
#  VTEC OS - Deploy Script para VPS (Hostinger)
#
#  Uso:
#    .\deploy.ps1 -VpsHost root@<IP_DA_VPS>
#    .\deploy.ps1                       # usa o host padrão abaixo
#    .\deploy.ps1 -SkipBuild            # reenvia o último build
#
#  Pré-requisito: servidor preparado com scripts/setup-vps.sh
# =============================================================

param(
    [string]$VpsHost = "root@SEU_IP_HOSTINGER",
    [string]$VpsDir  = "/root/vtec-os",
    [string]$AppName = "vtec-os",
    [int]$Port       = 3000,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Log($msg, $color = "Cyan") {
    Write-Host ""
    Write-Host $msg -ForegroundColor $color
}

if ($VpsHost -like "*SEU_IP_HOSTINGER*") {
    Write-Error "Informe o servidor: .\deploy.ps1 -VpsHost root@<IP_DA_VPS> (ou edite o valor padrao no topo do script)."
    exit 1
}

# -- 0. Verificações -------------------------------------------
if (-not (Test-Path ".env.local")) {
    Write-Error ".env.local nao encontrado. As variaveis NEXT_PUBLIC_* precisam existir no momento do build."
    exit 1
}

$envContent = Get-Content ".env.local" -Raw
if ($envContent -notmatch "(?m)^WHATSAPP_WEB_SESSION_PATH=/") {
    Write-Host "[AVISO] WHATSAPP_WEB_SESSION_PATH nao aponta para um caminho absoluto no .env.local." -ForegroundColor Yellow
    Write-Host "        Recomendado: WHATSAPP_WEB_SESSION_PATH=/var/lib/vtec/whatsapp-session" -ForegroundColor Yellow
}
if ($envContent -match "(?m)^NEXT_PUBLIC_APP_URL=http://localhost") {
    Write-Host "[AVISO] NEXT_PUBLIC_APP_URL ainda aponta para localhost. Webhooks e links gerados vao quebrar." -ForegroundColor Yellow
}

# -- 1. Build local --------------------------------------------
if ($SkipBuild) {
    Log "[1/5] Build pulado (-SkipBuild)."
    if (-not (Test-Path ".next")) { Write-Error "Nenhum build encontrado em .next"; exit 1 }
} else {
    Log "[1/5] Buildando o projeto Next.js..."
    npm run build
    if ($LASTEXITCODE -ne 0) { Write-Error "Build falhou. Abortando."; exit 1 }
}

# -- 2. Empacotar ----------------------------------------------
# Um único .tar.gz é muito mais rápido que scp -r de milhares de arquivos
# e evita sobrar arquivos antigos do build anterior no servidor.
Log "[2/5] Empacotando arquivos..."

$items = @(".next", "public", "package.json", "package-lock.json", "next.config.ts", "tsconfig.json", ".env.local")
$missing = $items | Where-Object { -not (Test-Path $_) }
if ($missing) { Write-Error "Arquivos nao encontrados: $($missing -join ', ')"; exit 1 }

$archive = Join-Path $env:TEMP "vtec-deploy.tar.gz"
if (Test-Path $archive) { Remove-Item $archive -Force }

tar -czf $archive --exclude=".next/cache" @items
if ($LASTEXITCODE -ne 0) { Write-Error "Falha ao empacotar os arquivos."; exit 1 }
$sizeMb = [math]::Round((Get-Item $archive).Length / 1MB, 1)
Write-Host "  -> Pacote: $sizeMb MB" -ForegroundColor DarkCyan

# -- 3. Enviar -------------------------------------------------
Log "[3/5] Enviando para $VpsHost..."
ssh $VpsHost "mkdir -p $VpsDir"
if ($LASTEXITCODE -ne 0) { Write-Error "Nao foi possivel conectar em $VpsHost"; exit 1 }

scp $archive "${VpsHost}:/tmp/vtec-deploy.tar.gz"
if ($LASTEXITCODE -ne 0) { Write-Error "Falha ao enviar o pacote."; exit 1 }

# -- 4. Instalar e reiniciar na VPS ----------------------------
Log "[4/5] Instalando dependencias e reiniciando na VPS..."

$bashScript = @'
#!/bin/bash
set -e
APP_DIR="__APP_DIR__"
APP_NAME="__APP_NAME__"
PORT="__PORT__"

cd "$APP_DIR"
echo "--- Versoes: Node=$(node --version) NPM=$(npm --version) ---"

echo "--- Extraindo pacote ---"
rm -rf .next
tar -xzf /tmp/vtec-deploy.tar.gz -C "$APP_DIR"
rm -f /tmp/vtec-deploy.tar.gz
chmod 600 .env.local

SESSION_PATH="$(grep -E '^WHATSAPP_WEB_SESSION_PATH=' .env.local | cut -d= -f2- | tr -d '"'"'"'\r' || true)"
if [ -n "$SESSION_PATH" ]; then mkdir -p "$SESSION_PATH"; fi

echo "--- Instalando dependencias de producao ---"
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
    if curl -fsS -o /dev/null "http://127.0.0.1:$PORT"; then
        echo "App respondendo na porta $PORT."
        exit 0
    fi
    sleep 2
done
echo "App nao respondeu em 40s. Ultimos logs:"
pm2 logs "$APP_NAME" --lines 40 --nostream
exit 1
'@

$bashScript = $bashScript.Replace("__APP_DIR__", $VpsDir).Replace("__APP_NAME__", $AppName).Replace("__PORT__", "$Port")

$tmpScript = Join-Path $env:TEMP "vtec_deploy.sh"
[System.IO.File]::WriteAllText($tmpScript, $bashScript.Replace("`r`n", "`n"))

scp $tmpScript "${VpsHost}:/tmp/vtec_deploy.sh"
if ($LASTEXITCODE -ne 0) { Write-Error "Falha ao enviar script de deploy"; exit 1 }

ssh $VpsHost "bash /tmp/vtec_deploy.sh"
if ($LASTEXITCODE -ne 0) { Write-Error "Falha ao executar script na VPS."; exit 1 }

Remove-Item $archive -Force -ErrorAction SilentlyContinue

# -- 5. Verificar status ---------------------------------------
Log "[5/5] Verificando status na VPS..."
ssh $VpsHost "pm2 list"

Write-Host ""
Write-Host "Deploy concluido!" -ForegroundColor Green
