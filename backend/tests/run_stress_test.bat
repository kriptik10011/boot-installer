@echo off
setlocal
cd /d "%~dp0.."
set OUTFILE=%TEMP%\stress_test_output.txt
set DONEFILE=%TEMP%\stress_test_done.txt
if exist "%DONEFILE%" del "%DONEFILE%"
echo Starting stress test at %date% %time% > "%OUTFILE%"
echo. >> "%OUTFILE%"
python tests\run_stress_test.py --workers 4 --report >> "%OUTFILE%" 2>&1
echo. >> "%OUTFILE%"
echo EXITCODE=%ERRORLEVEL% >> "%OUTFILE%"
echo DONE > "%DONEFILE%"
