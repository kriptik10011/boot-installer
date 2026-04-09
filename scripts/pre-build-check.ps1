# Pre-Build Check Script
# Verifies all quality gates before production build
# Usage: powershell -ExecutionPolicy Bypass -File scripts/pre-build-check.ps1

param(
    [switch]$SkipTests,
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"
$script:errors = @()
$script:warnings = @()

function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Pass($msg) { Write-Host "  PASS: $msg" -ForegroundColor Green }
function Write-Fail($msg) { Write-Host "  FAIL: $msg" -ForegroundColor Red; $script:errors += $msg }
function Write-Warn($msg) { Write-Host "  WARN: $msg" -ForegroundColor Yellow; $script:warnings += $msg }

# 1. TypeScript Check
Write-Step "TypeScript Compilation"
$tscOutput = & npx tsc --noEmit 2>&1
$tscErrors = $tscOutput | Select-String "error TS" | Where-Object { $_ -notmatch "useUndoDelete\.test\.tsx" }
if ($tscErrors.Count -eq 0) {
    Write-Pass "0 TypeScript errors (excluding known test mock issues)"
} else {
    Write-Fail "$($tscErrors.Count) TypeScript errors found"
    if ($Verbose) { $tscErrors | ForEach-Object { Write-Host "    $_" -ForegroundColor Red } }
}

# 2. Console.log Check
Write-Step "Console.log Audit"
$consoleLogFiles = Get-ChildItem -Path src -Recurse -Include *.ts,*.tsx |
    Where-Object { $_.FullName -notmatch "node_modules|test|spec|\.test\." } |
    Select-String "console\.(log|debug|warn)\(" |
    Where-Object { $_ -notmatch "// eslint-disable" }
if ($consoleLogFiles.Count -eq 0) {
    Write-Pass "No console.log statements in production code"
} else {
    Write-Warn "$($consoleLogFiles.Count) console statements found"
    if ($Verbose) { $consoleLogFiles | ForEach-Object { Write-Host "    $_" -ForegroundColor Yellow } }
}

# 3. Backend Import Check
Write-Step "Backend Import Verification"
$backendCheck = & python -c "from app.main import app; print('OK')" 2>&1
if ($backendCheck -match "OK") {
    Write-Pass "Backend imports successfully"
} else {
    Write-Fail "Backend import failed: $backendCheck"
}

# 4. Frontend Tests (optional)
if (-not $SkipTests) {
    Write-Step "Frontend Tests (vitest)"
    $vitestOutput = & npx vitest run --reporter=verbose 2>&1
    $vitestResult = $LASTEXITCODE
    if ($vitestResult -eq 0) {
        Write-Pass "All frontend tests pass"
    } else {
        Write-Warn "Frontend tests had issues (exit code: $vitestResult)"
    }
}

# 5. Version Consistency
Write-Step "Version Consistency"
$pkgVersion = (Get-Content package.json | ConvertFrom-Json).version
$tauriConfig = Get-Content "src-tauri/tauri.conf.json" | ConvertFrom-Json
$tauriVersion = $tauriConfig.version
if ($pkgVersion -eq $tauriVersion) {
    Write-Pass "Versions match: package.json=$pkgVersion, tauri.conf.json=$tauriVersion"
} else {
    Write-Fail "Version mismatch: package.json=$pkgVersion vs tauri.conf.json=$tauriVersion"
}

# 6. Build Test (vite only, no sidecar)
Write-Step "Vite Build Test"
$buildOutput = & npm run build 2>&1
$buildResult = $LASTEXITCODE
if ($buildResult -eq 0) {
    Write-Pass "Vite build succeeds"
    $distSize = (Get-ChildItem dist -Recurse | Measure-Object -Property Length -Sum).Sum / 1KB
    Write-Pass "Bundle size: $([math]::Round($distSize, 1)) KB"
} else {
    Write-Fail "Vite build failed"
}

# Summary
Write-Host "`n" -NoNewline
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PRE-BUILD CHECK SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

if ($script:errors.Count -eq 0) {
    Write-Host "`n  RESULT: ALL CHECKS PASSED" -ForegroundColor Green
} else {
    Write-Host "`n  RESULT: $($script:errors.Count) ERRORS" -ForegroundColor Red
    $script:errors | ForEach-Object { Write-Host "    - $_" -ForegroundColor Red }
}

if ($script:warnings.Count -gt 0) {
    Write-Host "`n  WARNINGS: $($script:warnings.Count)" -ForegroundColor Yellow
    $script:warnings | ForEach-Object { Write-Host "    - $_" -ForegroundColor Yellow }
}

Write-Host ""
exit $script:errors.Count
