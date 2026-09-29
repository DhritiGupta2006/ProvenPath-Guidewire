@echo off
rem Stops ProvenPath (agent, web, backend) and leaves PolicyCenter running.
rem The backend is stopped gracefully (its shutdown hook also stops the embedded PostgreSQL); only if that fails
rem is it force-killed, and then the postgres.exe that uses EMBEDDED_PG_DIR is stopped too.
setlocal EnableExtensions
for %%i in ("%~dp0..") do set "ROOT=%%~fi"
call "%~dp0env.cmd" || exit /b 1

echo [agent] stopping (PolicyCenter keeps running)...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='java.exe'\" | Where-Object { $_.CommandLine -like '*provenpath-pcagent.jar*' } | ForEach-Object { Stop-Process -Id $_.ProcessId }"

echo [web] stopping...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort %WEB_PORT% -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue }"

echo [backend] stopping gracefully...
curl.exe -s -m 5 -X POST "http://localhost:%BACKEND_PORT%/api/v1/admin/shutdown" >nul
set /a PP_WAIT=0
:wait_backend
curl.exe -s -o nul -m 2 "http://localhost:%BACKEND_PORT%/api/v1/health"
if errorlevel 1 goto backend_down
rem ~2 s pause (ping works even when stdin is redirected, unlike timeout.exe)
ping -n 3 127.0.0.1 >nul
set /a PP_WAIT+=2
if %PP_WAIT% LSS 30 goto wait_backend
echo [backend] still up after 30 s: force-stopping it and its PostgreSQL
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort %BACKEND_PORT% -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='postgres.exe'\" | Where-Object { $_.CommandLine -like '*%EMBEDDED_PG_DIR%*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
:backend_down
echo [backend] stopped

rem Close OUR consoles only: cmd.exe processes running vm\run-*.cmd, found by command line. Never match by window
rem title (a File Explorer window on the repo folder is also titled "ProvenPath..." and is explorer.exe).
rem No tree kill: a PolicyCenter started by the agent must survive.
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='cmd.exe'\" | Where-Object { $_.CommandLine -and ($_.CommandLine.Contains('run-backend.cmd') -or $_.CommandLine.Contains('run-web.cmd') -or $_.CommandLine.Contains('run-agent.cmd')) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
echo Done. PolicyCenter was not touched.
exit /b 0
