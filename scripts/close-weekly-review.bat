@echo off
echo Closing Weekly Review processes...
echo.

taskkill /F /IM "Weekly Review.exe" /T 2>nul
if %errorlevel% == 0 (
    echo Closed: Weekly Review.exe
) else (
    echo Not running: Weekly Review.exe
)

taskkill /F /IM "weekly-review.exe" /T 2>nul
if %errorlevel% == 0 (
    echo Closed: weekly-review.exe
) else (
    echo Not running: weekly-review.exe
)

taskkill /F /IM "weekly-review-backend.exe" /T 2>nul
if %errorlevel% == 0 (
    echo Closed: weekly-review-backend.exe
) else (
    echo Not running: weekly-review-backend.exe
)

taskkill /F /IM "weekly-review-backend-x86_64-pc-windows-msvc.exe" /T 2>nul
if %errorlevel% == 0 (
    echo Closed: weekly-review-backend-x86_64-pc-windows-msvc.exe
) else (
    echo Not running: weekly-review-backend-x86_64-pc-windows-msvc.exe
)

echo.
echo Done! Waiting 3 seconds for processes to fully terminate...
timeout /t 3 /nobreak >nul
echo.
echo You can now run the installer.
pause
