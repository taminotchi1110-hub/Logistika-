# KARVON - S3 fayl omborini (SeaweedFS) Docker'siz ko'tarish
#
# NEGA BU SKRIPT BOR: `docker compose up -d s3` Docker Desktop'ning Linux
# dvigatelini talab qiladi, u esa WSL distributivi bo'lmasa ko'tarilmaydi.
# SeaweedFS'ning Windows uchun bitta `weed.exe` fayli bor va u hech qanday
# virtualizatsiya yoki administrator huquqi talab qilmaydi.
#
# Ilgari bu yerda MinIO edi. MinIO tasvir va tayyor fayllarini tarqatishni
# to'xtatdi - prod va CI ham SeaweedFS'ga o'tgan (docs/19-deploy.md).
#
# O'RNATISH (bir marta):
#   1. https://github.com/seaweedfs/seaweedfs/releases/tag/4.46
#      sahifasidan `windows_amd64.zip` ni yuklab oling
#   2. Ichidagi `weed.exe` ni %LOCALAPPDATA%\karvon\bin\ papkasiga qo'ying
#      (yoki PATH dagi istalgan papkaga)
#
# ISHGA TUSHIRISH:
#   powershell -ExecutionPolicy Bypass -File scripts\start-s3.ps1
#
# Terminal band bo'lib qoladi - ombor shu oynada ishlaydi. To'xtatish:
# Ctrl+C. Ma'lumotlar diskda saqlanadi, qayta ishga tushirsangiz hujjatlar
# joyida qoladi.
#
# DIQQAT: qatorlar ichida faqat ASCII belgilar. PowerShell 5.1 BOM'siz
# faylni ANSI deb o'qiydi va UTF-8 tire belgisi CP1251 da yopiluvchi
# qo'shtirnoqqa aylanadi - qator vaqtidan oldin tugab, skript parse
# bo'lmaydi.

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot

# API ham shu tartibda qidiradi (`app.module.ts`: `../../.env`, so'ng
# `.env`) - sozlamalar IKKI JOYDA bo'lib qolmasligi uchun aynan o'sha
# fayl o'qiladi.
$envFile = $null
foreach ($candidate in @((Join-Path $root '.env'), (Join-Path $root 'apps\api\.env'))) {
    if (Test-Path $candidate) { $envFile = $candidate; break }
}

if (-not $envFile) {
    Write-Host ".env topilmadi. Avval .env.example dan nusxa oling." -ForegroundColor Red
    exit 1
}

# MAXFIY SO'ZLAR SKRIPTGA YOZILMAYDI - .env dan o'qiladi. Aks holda
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

$accessKey = Setting 'S3_ACCESS_KEY' 'karvon'
$secretKey = Setting 'S3_SECRET_KEY' $null
$port      = Setting 'S3_PORT' '9000'
$filerPort = Setting 'S3_FILER_PORT' '8888'
$bucket    = Setting 'S3_BUCKET' 'karvon'

if (-not $secretKey) {
    Write-Host "$envFile da S3_SECRET_KEY yo'q." -ForegroundColor Red
    exit 1
}

# Kalitlar JSON ichiga yoziladi - prod skripti (deploy/s3-start.sh) bilan
# bir xil cheklov: qo'shtirnoq yoki teskari chiziq faylni buzardi
if ("$accessKey$secretKey" -notmatch '^[A-Za-z0-9_-]+$') {
    Write-Host "S3_ACCESS_KEY va S3_SECRET_KEY da faqat harf, raqam, _ va - bo'lishi mumkin." -ForegroundColor Red
    exit 1
}

$weedPath = Join-Path $env:LOCALAPPDATA 'karvon\bin\weed.exe'
$weedCommand = Get-Command weed -ErrorAction SilentlyContinue
if ($weedCommand) {
    $weedPath = $weedCommand.Source
} elseif (-not (Test-Path $weedPath)) {
    Write-Host ""
    Write-Host "weed.exe topilmadi. Bir marta bajaring:" -ForegroundColor Yellow
    Write-Host "  1. https://github.com/seaweedfs/seaweedfs/releases/tag/4.46" -ForegroundColor Cyan
    Write-Host "     sahifasidan windows_amd64.zip ni yuklab oling"
    Write-Host "  2. Ichidagi weed.exe ni shu papkaga qo'ying:"
    Write-Host "     $(Split-Path -Parent $weedPath)" -ForegroundColor Cyan
    exit 1
}

# Port bo'shligini OLDIN tekshiramiz: band portda ombor o'z xatosini
# beradi, lekin sababi darhol tushunarli bo'lmaydi.
$busy = Test-NetConnection -ComputerName localhost -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue
if ($busy) {
    Write-Host "$port porti allaqachon band - ombor ishlab turgan bo'lishi mumkin." -ForegroundColor Yellow
    Write-Host "Tekshirish: curl.exe -I http://localhost:$port/   (403 - ishlayapti)"
    exit 0
}

# Ma'lumotlar repozitoriydan TASHQARIDA: aks holda yuklangan hujjatlar
# git status'ni to'ldiradi va tasodifan commit qilinishi mumkin.
$dataDir = Join-Path $env:LOCALAPPDATA 'karvon\s3-data'
if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
}

# Kirish kalitlari - prod bilan bir xil format (deploy/s3-start.sh).
# BOM'siz UTF-8: PowerShell 5.1 dagi `-Encoding utf8` BOM qo'shadi va
# JSON o'quvchi uni xato deb biladi.
$configPath = Join-Path $dataDir 's3.json'
$config = '{"identities":[{"name":"karvon","credentials":[{"accessKey":"' + $accessKey +
    '","secretKey":"' + $secretKey +
    '"}],"actions":["Admin","Read","List","Tagging","Write"]}]}'
[System.IO.File]::WriteAllText($configPath, $config, (New-Object System.Text.UTF8Encoding $false))

Write-Host ""
Write-Host "S3 fayl ombori (SeaweedFS) ishga tushmoqda" -ForegroundColor Green
Write-Host "  S3 API   : http://localhost:$port"
Write-Host "  Fayllar  : http://localhost:$filerPort"
Write-Host "  Ma'lumot : $dataDir"
Write-Host ""
Write-Host "'$bucket' bucket'ini API ishga tushishda o'zi yaratadi (dev rejimi)." -ForegroundColor DarkGray
Write-Host "To'xtatish: Ctrl+C" -ForegroundColor DarkGray
Write-Host ""

# Filer o'z bazasini (leveldb) joriy papkada ochishi mumkin - shuning uchun
# ma'lumotlar papkasidan ishga tushiramiz. Hamma portlar faqat 127.0.0.1 da:
# tarmoqdagi boshqa kompyuterlar ulana olmaydi va Windows brandmauer so'ramaydi.
Push-Location $dataDir
try {
    & $weedPath server "-dir=$dataDir" '-volume.max=0' '-master.volumeSizeLimitMB=1024' `
        '-ip=127.0.0.1' '-ip.bind=127.0.0.1' `
        '-s3' "-s3.port=$port" "-s3.config=$configPath" "-filer.port=$filerPort"
} finally {
    Pop-Location
}
