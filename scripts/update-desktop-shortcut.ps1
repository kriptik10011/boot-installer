# Update Desktop Shortcut for Weekly Review
# This script updates the desktop shortcut to point to the latest build

$ShortcutPath = "$env:USERPROFILE\Desktop\Weekly Review.lnk"
$TargetExe = "$PSScriptRoot\..\src-tauri\target\release\weekly-review.exe"
$WorkingDir = "$PSScriptRoot\..\src-tauri\target\release"

# Resolve to absolute paths
$TargetExe = (Resolve-Path $TargetExe -ErrorAction SilentlyContinue).Path
$WorkingDir = (Resolve-Path $WorkingDir -ErrorAction SilentlyContinue).Path

if (-not $TargetExe) {
    Write-Host "Warning: Built exe not found. Run 'npm run tauri build' first." -ForegroundColor Yellow
    exit 0
}

# Create or update shortcut
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $TargetExe
$Shortcut.WorkingDirectory = $WorkingDir
$Shortcut.Description = 'Weekly Review - Your weekly command center'
$Shortcut.Save()

Write-Host "Desktop shortcut updated: $ShortcutPath -> $TargetExe" -ForegroundColor Green
