# Release Build Script
# Builds production installer with pre-checks and checksum
# Usage: powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1

param(
    [switch]$SkipPreCheck,
    [switch]$DebugBuild
)

$ErrorActionPreference = "Stop"
$startTime = Get-Date

function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Info($msg) { Write-Host "  $msg" -ForegroundColor White }

$version = (Get-Content package.json | ConvertFrom-Json).version
Write-Host "`nWeekly Review v$version — Release Build" -ForegroundColor Magenta
Write-Host ("=" * 50) -ForegroundColor Magenta

# 1. Pre-build checks
if (-not $SkipPreCheck) {
    Write-Step "Running pre-build checks"
    & powershell -ExecutionPolicy Bypass -File scripts/pre-build-check.ps1 -SkipTests
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`nPre-build checks failed. Fix errors before building." -ForegroundColor Red
        exit 1
    }
}

# 2. Clean previous build artifacts
Write-Step "Cleaning previous build"
if (Test-Path dist) { Remove-Item -Recurse -Force dist }
Write-Info "Cleaned dist/"

# 3. Build sidecar
Write-Step "Building Python sidecar"
Push-Location backend
& pyinstaller weekly-review-backend-x86_64-pc-windows-msvc.spec --noconfirm 2>&1 | Out-Null
Pop-Location
Copy-Item -Force "backend\dist\weekly-review-backend-x86_64-pc-windows-msvc.exe" "src-tauri\binaries\weekly-review-backend-x86_64-pc-windows-msvc.exe"
$sidecarSize = (Get-Item "src-tauri\binaries\weekly-review-backend-x86_64-pc-windows-msvc.exe").Length / 1MB
Write-Info "Sidecar built: $([math]::Round($sidecarSize, 1)) MB"

# 4. Build frontend
Write-Step "Building frontend"
if ($DebugBuild) {
    Write-Info "MODE: Debug (debug panel always on)"
    & npm run build:debug
} else {
    Write-Info "MODE: Production (debug code eliminated)"
    & npm run build:production
}

$distSize = (Get-ChildItem dist -Recurse | Measure-Object -Property Length -Sum).Sum / 1KB
Write-Info "Frontend bundle: $([math]::Round($distSize, 1)) KB"

# 5. Build Tauri installer
Write-Step "Building Tauri installer"
if ($DebugBuild) {
    $env:WEEKLY_REVIEW_DEV_MODE = "true"
    $env:TAURI_ENV_DEBUG_BUILD = "true"
}
& npx tauri build 2>&1

# 6. Find and checksum the installer
Write-Step "Installer checksum"
$installerDir = "src-tauri\target\release\bundle\nsis"
$installer = Get-ChildItem -Path $installerDir -Filter "*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if ($installer) {
    $installerSize = $installer.Length / 1MB
    $hash = (Get-FileHash $installer.FullName -Algorithm SHA256).Hash
    Write-Info "Installer: $($installer.Name)"
    Write-Info "Size: $([math]::Round($installerSize, 1)) MB"
    Write-Info "SHA-256: $hash"

    # Write checksum file
    $checksumFile = Join-Path $installerDir "SHA256SUMS.txt"
    "$hash  $($installer.Name)" | Out-File -FilePath $checksumFile -Encoding UTF8
    Write-Info "Checksum written to $checksumFile"
} else {
    Write-Host "  WARNING: No installer found in $installerDir" -ForegroundColor Yellow
}

# 7. Update desktop shortcut
Write-Step "Updating desktop shortcut"
& powershell -ExecutionPolicy Bypass -File scripts/update-desktop-shortcut.ps1

# Summary
$elapsed = (Get-Date) - $startTime
Write-Host "`n" -NoNewline
Write-Host ("=" * 50) -ForegroundColor Green
Write-Host "  BUILD COMPLETE — v$version" -ForegroundColor Green
Write-Host "  Time: $([math]::Round($elapsed.TotalMinutes, 1)) minutes" -ForegroundColor Green
Write-Host ("=" * 50) -ForegroundColor Green
