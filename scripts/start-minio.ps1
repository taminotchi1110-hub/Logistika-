# KARVON — S3 storage'ni Docker'siz ko'tarish
#
# NEGA BU SKRIPT BOR: `docker compose up -d minio` Docker Desktop'ning
# Linux dvigatelini talab qiladi, u esa WSL distributivi bo'lmasa
# ko'tarilmaydi. MinIO'ning Windows uchun bitta .exe fayli bor va u
# hech qanday virtualizatsiya talab qilmaydi.
#
# O'RNATISH (bir marta):
#   winget install -e --id MinIO.Server
#
# ISHGA TUSHIRISH:
#   powershell -ExecutionPolicy Bypass -File scripts\start-minio.ps1
#
# Terminal band bo'lib qoladi — MinIO shu oynada ishlaydi. To'xtatish:
# Ctrl+C. Ma'lumotlar diskda saqlanadi, qayta ishga tushirsangiz
# hujjatlar joyida qoladi.

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot

# API ham shu tartibda qidiradi (`app.module.ts`: `../../.env`, so'ng
# `.env`) — sozlamalar IKKI JOYDA bo'lib qolmasligi uchun aynan o'sha
# fayl o'qiladi.
$envFile = $null
foreach ($candidate in @((Join-Path $root '.env'), (Join-Path $root 'apps\api\.env'))) {
    if (Test-Path $candidate) { $envFile = $candidate; break }
}

if (-not $envFile) {
    Write-Host ".env topilmadi. Avval .env.example dan nusxa oling." -ForegroundColor Red
    exit 1
}

# MAXFIY SO'ZLAR SKRIPTGA YOZILMAYDI — .env dan o'qiladi. Aks holda
# ular git'ga tushib ketardi.
$settings = @{}
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)$') {
        $settings[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
    }
}

function Setting($name, $fallback) {
    if ($settings.ContainsKey($name) -and $settings[$name]) { return $settings[$name] }
    return $fallback
}

$accessKey   = Setting 'S3_ACCESS_KEY' 'karvon'
$secretKey   = Setting 'S3_SECRET_KEY' $null
$port        = Setting 'S3_PORT' '9000'
$consolePort = Setting 'S3_CONSOLE_PORT' '9001'
$bucket      = Setting 'S3_BUCKET' 'karvon'

if (-not $secretKey) {
    Write-Host "apps\api\.env da S3_SECRET_KEY yo'q." -ForegroundColor Red
    exit 1
}

$minio = Get-Command minio -ErrorAction SilentlyContinue
if (-not $minio) {
    Write-Host ""
    Write-Host "MinIO o'rnatilmagan. Bir marta bajaring:" -ForegroundColor Yellow
    Write-Host "  winget install -e --id MinIO.Server" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "So'ng terminalni YOPIB-OCHIB, shu skriptni qayta ishga tushiring"
    Write-Host "(PATH yangilanishi uchun)."
    exit 1
}

# Port bo'shligini OLDIN tekshiramiz: MinIO band portda o'zining
# xatosini beradi, lekin u "Address already in use" ko'rinishida
# bo'lib, sababi darhol tushunarli bo'lmaydi.
$busy = Test-NetConnection -ComputerName localhost -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue
if ($busy) {
    # DIQQAT: qatorlar ichida faqat ASCII belgilar. PowerShell 5.1 BOM'siz
    # faylni ANSI deb o'qiydi va UTF-8 tire (—) CP1251 da yopiluvchi
    # qo'shtirnoqqa aylanadi — qator vaqtidan oldin tugab, skript
    # parse bo'lmaydi. Izohlarda muammo yo'q, qatorlarda bor.
    Write-Host "$port porti allaqachon band - MinIO ishlab turgan bo'lishi mumkin." -ForegroundColor Yellow
    Write-Host "Tekshirish: curl http://localhost:$port/minio/health/live"
    exit 0
}

# Ma'lumotlar repozitoriydan TASHQARIDA: aks holda yuklangan hujjatlar
# git status'ni to'ldiradi va tasodifan commit qilinishi mumkin.
$dataDir = Join-Path $env:LOCALAPPDATA 'karvon\minio-data'
if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
}

$env:MINIO_ROOT_USER = $accessKey
$env:MINIO_ROOT_PASSWORD = $secretKey

Write-Host ""
Write-Host "MinIO ishga tushmoqda" -ForegroundColor Green
Write-Host "  API      : http://localhost:$port"
Write-Host "  Konsol   : http://localhost:$consolePort"
Write-Host "  Ma'lumot : $dataDir"
Write-Host ""
Write-Host "'$bucket' bucket'i API birinchi so'rovda o'zi yaratadi (dev rejimi)." -ForegroundColor DarkGray
Write-Host "To'xtatish: Ctrl+C" -ForegroundColor DarkGray
Write-Host ""

& $minio.Source server $dataDir --address ":$port" --console-address ":$consolePort"
