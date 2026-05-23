# =============================================================
#  VTEC OS - Deploy Script para VPS 191.252.192.29
#  Uso: .\deploy.ps1
# =============================================================

$VPS_HOST = "root@191.252.192.29"
$VPS_DIR  = "/root/vtec-os"
$APP_NAME = "vtec-os"
$ErrorActionPreference = "Stop"

function Log($msg, $color = "Cyan") {
    Write-Host ""
    Write-Host $msg -ForegroundColor $color
}

# -- 1. Build local --------------------------------------------
Log "[1/5] Buildando o projeto Next.js..."
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "Build falhou. Abortando."; exit 1 }

# -- 2. Preparar pasta na VPS ----------------------------------
Log "[2/5] Preparando diretorio na VPS..."
ssh $VPS_HOST "mkdir -p $VPS_DIR"

# -- 3. Enviar arquivos ----------------------------------------
Log "[3/5] Enviando arquivos para a VPS..."

$filesToSend = @(".next", "public", "package.json", "package-lock.json", "next.config.ts", "tsconfig.json", ".env.local")

foreach ($item in $filesToSend) {
    $fullPath = Join-Path (Get-Location) $item
    if (Test-Path $fullPath) {
        Write-Host "  -> Enviando: $item" -ForegroundColor DarkCyan
        scp -r $fullPath "${VPS_HOST}:${VPS_DIR}/"
        if ($LASTEXITCODE -ne 0) { Write-Error "Falha ao enviar $item"; exit 1 }
    } else {
        Write-Host "  [AVISO] Nao encontrado: $item" -ForegroundColor Yellow
    }
}

# -- 4. Criar e executar script bash na VPS --------------------
Log "[4/5] Instalando dependencias e reiniciando na VPS..."

$bashScript = @'
#!/bin/bash
set -e
APP_DIR="/root/vtec-os"
APP_NAME="vtec-os"

echo "--- Entrando no diretorio ---"
cd "$APP_DIR"

echo "--- Versoes: Node=$(node --version) NPM=$(npm --version) ---"

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
'@

$tmpScript = "$env:TEMP\vtec_deploy.sh"
[System.IO.File]::WriteAllText($tmpScript, $bashScript.Replace("`r`n", "`n"))

scp $tmpScript "${VPS_HOST}:/tmp/vtec_deploy.sh"
if ($LASTEXITCODE -ne 0) { Write-Error "Falha ao enviar script de deploy"; exit 1 }

ssh $VPS_HOST "bash /tmp/vtec_deploy.sh"
if ($LASTEXITCODE -ne 0) { Write-Error "Falha ao executar script na VPS."; exit 1 }

# -- 5. Verificar status ---------------------------------------
Log "[5/5] Verificando status na VPS..."
ssh $VPS_HOST "pm2 list"

Write-Host ""
Write-Host "Deploy concluido! App rodando em http://191.252.192.29:3000" -ForegroundColor Green