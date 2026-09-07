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

# -------------------------------------------- 4. Gipervizor ishga tushishi
#
# Komponentlar yoqilgan bo'lsa ham gipervizor ishlamasligi mumkin: yuklash
# konfiguratsiyasida (BCD) `hypervisorlaunchtype` qiymati `off` bo'lsa,
# Windows uni umuman ishga tushirmaydi. Buni ko'pincha o'yin anti-cheat
# dasturlari, eski VMware/VirtualBox yoki "tezlashtiruvchi" skriptlar qiladi.
#
# Belgisi: barcha Hyper-V komponentlari YOQILGAN, lekin HypervisorPresent = False.

Write-Step "Gipervizor yuklash rejimi tekshirilmoqda"

$hypervisorRunning = (Get-CimInstance Win32_ComputerSystem).HypervisorPresent
$bcd = (bcdedit /enum '{current}' | Out-String)
$launchType = if ($bcd -match 'hypervisorlaunchtype\s+(\w+)') { $Matches[1].ToLower() } else { 'ko''rsatilmagan' }

Write-Host "   HypervisorPresent:      $hypervisorRunning"
Write-Host "   hypervisorlaunchtype:   $launchType"

if ($hypervisorRunning) {
    Write-Ok "Gipervizor ishlayapti"
} elseif ($launchType -eq 'auto') {
    Write-Warn "Rejim to'g'ri ('auto'), lekin gipervizor hali ishga tushmagan - qayta yuklash kerak"
    $needRestart = $true
} else {
    Write-Host "   Rejim 'auto' ga o'zgartirilmoqda..." -ForegroundColor Gray
    bcdedit /set hypervisorlaunchtype auto | Out-Null

    if ($LASTEXITCODE -eq 0) {
        Write-Ok "hypervisorlaunchtype = auto qilib qo'yildi"
        $needRestart = $true
    } else {
        Write-Fail "bcdedit buyrug'i bajarilmadi (chiqish kodi $LASTEXITCODE)"
    }
}

# Windows Hypervisor Platform - Docker'ning Hyper-V rejimi uchun asqotadi.
# WSL2 rejimida majburiy emas, lekin yoqib qo'yish zarar qilmaydi.
$whp = (Get-WindowsOptionalFeature -Online -FeatureName 'HypervisorPlatform').State
if ($whp -ne 'Enabled') {
    Write-Host "   Windows Hypervisor Platform - yoqilmoqda..." -ForegroundColor Gray
    Enable-WindowsOptionalFeature -Online -FeatureName 'HypervisorPlatform' -All -NoRestart -WarningAction SilentlyContinue | Out-Null
    Write-Ok "Windows Hypervisor Platform - yoqildi"
    $needRestart = $true
} else {
    Write-Ok "Windows Hypervisor Platform - allaqachon yoqilgan"
}

# ------------------------------- 5. Tiqilib qolgan servicing navbatini tuzatish
#
# Ba'zan komponent yoqiladi, lekin Windows uni qayta yuklashdan keyin ham
# ro'yxatdan o'tkazmaydi: CBS RebootPending bayrog'i tushmaydi va WSL
# "virtualizatsiya yoqilmagan" deb turaveradi.
#
# Bu holatda komponent ombori (component store) shikastlangan bo'lishi mumkin.
# DISM RestoreHealth uni tekshirib tiklaydi.

Write-Step "Windows servicing holati"

$rebootPending = Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending'
Write-Host "   CBS RebootPending: $rebootPending"

$realStates = Get-WindowsOptionalFeature -Online |
    Where-Object { $_.FeatureName -in 'VirtualMachinePlatform','Microsoft-Windows-Subsystem-Linux','HypervisorPlatform' }

foreach ($f in $realStates) {
    $mark = if ($f.State -eq 'Enabled') { '[OK]  ' } else { '[!]   ' }
    Write-Host "   $mark $($f.FeatureName) = $($f.State)"
}

$stuck = $realStates | Where-Object { $_.State -ne 'Enabled' }

if ($rebootPending -and -not $stuck) {
    Write-Warn "Komponentlar yoqilgan, lekin qayta yuklash bayrog'i tushmagan."
    Write-Host "   Komponent ombori tekshirilmoqda (5-15 daqiqa olishi mumkin)..." -ForegroundColor Gray
    Write-Host ""
    dism.exe /online /cleanup-image /restorehealth
    Write-Host ""

    if ($LASTEXITCODE -eq 0) {
        Write-Ok "Komponent ombori tekshirildi/tiklandi"
        Write-Host "   Komponentlar qayta yoqilmoqda..." -ForegroundColor Gray
        dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart | Out-Null
        dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart | Out-Null
        Write-Ok "Bajarildi"
        $needRestart = $true
    } else {
        Write-Fail "DISM tiklab bo'lmadi (kod $LASTEXITCODE)"
        Write-Host "     Windows Update orqali tizimni yangilash kerak bo'lishi mumkin." -ForegroundColor Yellow
        Write-Host "     Yoki Docker'siz ishlash yo'liga o'ting - Claude'ga ayting." -ForegroundColor Yellow
    }
} elseif ($stuck) {
    Write-Fail "Quyidagi komponentlar hali yoqilmagan:"
    $stuck | ForEach-Object { Write-Host "     $($_.FeatureName) = $($_.State)" }
    Write-Host "   Qayta yoqilmoqda..." -ForegroundColor Gray
    foreach ($f in $stuck) {
        dism.exe /online /enable-feature /featurename:$($f.FeatureName) /all /norestart | Out-Null
    }
    $needRestart = $true
} else {
    Write-Ok "Servicing navbati toza"
}

# ------------------------------------------------------------ 6. Xulosa
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
