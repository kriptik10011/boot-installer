# Build Tauri App
# Add MinGW to PATH for dlltool.exe

$ErrorActionPreference = "Stop"

Write-Host "Setting up build environment..." -ForegroundColor Cyan

# Add MinGW to PATH
$env:Path = "C:\msys64\mingw64\bin;$env:Path"

Write-Host "MinGW path added. Checking dlltool..." -ForegroundColor Cyan
$dlltool = Get-Command dlltool.exe -ErrorAction SilentlyContinue
if ($dlltool) {
    Write-Host "Found: $($dlltool.Source)" -ForegroundColor Green
} else {
    Write-Host "ERROR: dlltool.exe not found!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Building Tauri application..." -ForegroundColor Cyan
Write-Host "This may take several minutes..." -ForegroundColor Yellow
Write-Host ""

Set-Location $PSScriptRoot
npm run tauri:build

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Build complete!" -ForegroundColor Green
    Write-Host "Executable location: src-tauri\target\release\weekly-review.exe" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "Build failed with exit code $LASTEXITCODE" -ForegroundColor Red
}
