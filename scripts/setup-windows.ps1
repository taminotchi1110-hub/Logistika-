<#
.SYNOPSIS
    Karvon — Windows'da ishlab chiqish muhitini tayyorlash.

.DESCRIPTION
    Docker Desktop ishlashi uchun kerak bo'lgan Windows komponentlarini yoqadi.
    Skript FAQAT quyidagilarni qiladi:
      1. Apparat va tizim holatini tekshiradi (o'zgartirmaydi)
      2. VirtualMachinePlatform komponentini yoqadi
      3. Microsoft-Windows-Subsystem-Linux komponentini yoqadi
      4. Nima qilinganini va keyin nima qilish kerakligini aytadi

    HECH NARSA O'CHIRILMAYDI, hech qanday fayl yoki sozlama olib tashlanmaydi.
    Komponentlar allaqachon yoqilgan bo'lsa — skript ularga tegmaydi.

.NOTES
    Administrator huquqi bilan ishga tushirilishi shart.
    Ishga tushirish:
      1. Ushbu fayl ustiga o'ng tugma → "Run with PowerShell as administrator"
      2. Yoki administrator PowerShell'da:
         powershell -ExecutionPolicy Bypass -File "$HOME\karvon\scripts\setup-windows.ps1"
#>

$ErrorActionPreference = 'Stop'

function Write-Step   { param($m) Write-Host "`n>> $m" -ForegroundColor Cyan }
function Write-Ok     { param($m) Write-Host "   [OK]   $m" -ForegroundColor Green }
function Write-Warn   { param($m) Write-Host "   [!]    $m" -ForegroundColor Yellow }
function Write-Fail   { param($m) Write-Host "   [XATO] $m" -ForegroundColor Red }

Write-Host ""
Write-Host "==========================================" -ForegroundColor White
Write-Host "  KARVON - Windows muhitini tayyorlash" -ForegroundColor White
Write-Host "==========================================" -ForegroundColor White

# ---------------------------------------------------------------- 1. Huquq
Write-Step "Administrator huquqi tekshirilmoqda"

$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
$isAdmin   = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Fail "Bu skript administrator huquqi bilan ishga tushirilishi kerak."
    Write-Host ""
    Write-Host "  Qanday qilish kerak:" -ForegroundColor Yellow
    Write-Host "  1. Windows tugmasi -> 'PowerShell' deb yozing"
    Write-Host "  2. O'ng tugma -> 'Zapusk ot imeni administratora'"
    Write-Host "  3. Ochilgan oynada quyidagini qo'ying:"
    Write-Host ""
    Write-Host "     powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -ForegroundColor White
    Write-Host ""
    exit 1
}
Write-Ok "Administrator huquqi bor"

# ------------------------------------------------------------- 2. Apparat
Write-Step "Apparat talablari tekshirilmoqda"

$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
Write-Host "   Protsessor: $($cpu.Name.Trim())"

$hardwareOk = $true

if ($cpu.VirtualizationFirmwareEnabled) {
    Write-Ok "BIOS'da virtualizatsiya yoqilgan"
} else {
    Write-Fail "BIOS'da virtualizatsiya O'CHIRILGAN"
    Write-Host "     Kompyuterni qayta yuklang, BIOS/UEFI ga kiring va yoqing:"
    Write-Host "     AMD uchun: 'SVM Mode'   |   Intel uchun: 'Intel VT-x'"
    $hardwareOk = $false
}

if ($cpu.SecondLevelAddressTranslationExtensions) {
    Write-Ok "SLAT qo'llab-quvvatlanadi"
} else {
    Write-Fail "SLAT yo'q - Docker bu kompyuterda ishlamaydi"
    $hardwareOk = $false
}

$os = Get-CimInstance Win32_OperatingSystem
Write-Host "   Tizim: $($os.Caption) (build $([Environment]::OSVersion.Version.Build))"

if (-not $hardwareOk) {
    Write-Host ""
    Write-Fail "Apparat talablari bajarilmadi. Yuqoridagi ko'rsatmalarni bajaring."
    exit 1
}

# ---------------------------------------------------- 3. Komponentlar holati
Write-Step "Windows komponentlari holati"

$features = @(
    @{ Name = 'VirtualMachinePlatform';            Title = 'Virtual Machine Platform' },
    @{ Name = 'Microsoft-Windows-Subsystem-Linux'; Title = 'Windows Subsystem for Linux' }
)

$needRestart = $false

foreach ($feature in $features) {
    $state = (Get-WindowsOptionalFeature -Online -FeatureName $feature.Name).State

    if ($state -eq 'Enabled') {
        Write-Ok "$($feature.Title) - allaqachon yoqilgan"
        continue
    }

    Write-Host "   $($feature.Title) - yoqilmoqda..." -ForegroundColor Gray
    $result = Enable-WindowsOptionalFeature -Online -FeatureName $feature.Name -All -NoRestart -WarningAction SilentlyContinue

    if ((Get-WindowsOptionalFeature -Online -FeatureName $feature.Name).State -eq 'Enabled' -or $result.RestartNeeded) {
        Write-Ok "$($feature.Title) - yoqildi"
        $needRestart = $true
    } else {
        Write-Fail "$($feature.Title) - yoqib bo'lmadi"
    }
}

# ------------------------------------------------------------ 4. Xulosa
Write-Step "Natija"

if ($needRestart) {
    Write-Warn "KOMPYUTERNI QAYTA YUKLASH KERAK"
    Write-Host ""
    Write-Host "   Qayta yuklangandan keyin:" -ForegroundColor White
    Write-Host "   1. Docker Desktop'ni oching (Start menyudan)"
    Write-Host "   2. Litsenziya shartlarini o'qib qabul qiling"
    Write-Host "   3. Pastki chapdagi kit belgisi YASHIL bo'lguncha kuting"
    Write-Host "   4. Claude'ga 'tayyor' deb yozing - qolganini u bajaradi"
    Write-Host ""
    Write-Host "   Hozir qayta yuklaysizmi? Buyruq:" -ForegroundColor Gray
    Write-Host "     Restart-Computer" -ForegroundColor White
} else {
    Write-Ok "Barcha komponentlar allaqachon yoqilgan - qayta yuklash shart emas"
    Write-Host ""
    Write-Host "   Endi Docker Desktop'ni ishga tushiring va Claude'ga xabar bering." -ForegroundColor White
}

Write-Host ""
Write-Host "   Agar Docker 'WSL kernel version too low' desa:" -ForegroundColor Gray
Write-Host "   https://aka.ms/wsl2kernel dan wsl_update_x64.msi ni yuklab o'rnating" -ForegroundColor Gray
Write-Host ""
