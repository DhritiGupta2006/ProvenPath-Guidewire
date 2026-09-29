@echo off
rem Mission Control (next start) in this console. Output is also appended to web.log.
setlocal EnableExtensions
for %%i in ("%~dp0..") do set "ROOT=%%~fi"
call "%~dp0env.cmd" || exit /b 1
title ProvenPath web :%WEB_PORT%
cd /d "%ROOT%\web"
node node_modules\next\dist\bin\next start -p %WEB_PORT% 2>&1 | powershell -NoProfile -Command "$input | Tee-Object -FilePath '%PP_LOGS%\web.log' -Append"
