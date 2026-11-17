# SIED SYSTEM V5 - instalacao automatica dos requisitos de compilacao
# Execute este arquivo como ADMINISTRADOR (clique direito > Executar com PowerShell)

$ErrorActionPreference = 'Stop'
Write-Host "=== SIED SYSTEM V5 - instalando requisitos ===" -ForegroundColor Cyan

# Confirma privilegio de administrador
$admin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
    Write-Host "[ERRO] Este script precisa ser executado como Administrador." -ForegroundColor Red
    Write-Host "Feche, clique com o botao direito neste arquivo e escolha 'Executar com PowerShell' como administrador." -ForegroundColor Yellow
    Read-Host "Pressione Enter para sair"
    exit 1
}

# Confirma winget
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host "[ERRO] winget nao encontrado. Atualize o 'Instalador de Aplicativo' pela Microsoft Store e rode de novo." -ForegroundColor Red
    Read-Host "Pressione Enter para sair"
    exit 1
}

Write-Host "`n[1/3] Instalando Rust (rustup)..." -ForegroundColor Green
winget install --id Rustlang.Rustup -e --accept-source-agreements --accept-package-agreements

Write-Host "`n[2/3] Instalando Visual Studio Build Tools com C++ (pode demorar varios minutos)..." -ForegroundColor Green
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --accept-source-agreements --accept-package-agreements --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"

Write-Host "`n[3/3] Configurando toolchain stable do Rust..." -ForegroundColor Green
$rustup = "$env:USERPROFILE\.cargo\bin\rustup.exe"
if (Test-Path $rustup) { & $rustup default stable } else { Write-Host "[AVISO] rustup sera configurado apos reiniciar." -ForegroundColor Yellow }

Write-Host "`n=== Concluido ===" -ForegroundColor Cyan
Write-Host "REINICIE o computador e depois execute GERAR-APP.bat para gerar o aplicativo." -ForegroundColor Yellow
Read-Host "Pressione Enter para sair"
