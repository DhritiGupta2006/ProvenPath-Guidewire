@echo off
rem ProvenPath on the Guidewire VM, all native and on localhost:
rem   backend :8080 (its own embedded PostgreSQL), web :3000 (next start), and the PC agent next to PolicyCenter.
rem Each runs in its own titled console; logs go to C:\ProvenPath-backup\logs. Safe to re-run: whatever is
rem already running is left alone. No admin rights, no Windows services, no Docker.
rem   vm\start-all.cmd           start (builds the jars and the web app the first time)
rem   vm\start-all.cmd --build   rebuild everything first (after a git pull)
setlocal EnableExtensions
for %%i in ("%~dp0..") do set "ROOT=%%~fi"
call "%~dp0env.cmd" || exit /b 1

set "APP_JAR=%ROOT%\backend\app\build\libs\provenpath-app.jar"
set "AGENT_JAR=%ROOT%\backend\pcagent\build\libs\provenpath-pcagent.jar"
set "PP_BUILD="
if /i "%~1"=="--build" set "PP_BUILD=1"
if not exist "%APP_JAR%" set "PP_BUILD=1"
if not exist "%AGENT_JAR%" set "PP_BUILD=1"
if not defined PP_BUILD goto web_build
echo [build] backend + PC agent (Temurin 11, Gradle wrapper)...
call "%ROOT%\backend\gradlew.bat" -p "%ROOT%\backend" :app:fatJar :pcagent:fatJar --no-daemon -q
if errorlevel 1 (
  echo [build] FAILED
  exit /b 1
)

:web_build
if /i "%~1"=="--build" goto do_web_build
if exist "%ROOT%\web\.next\BUILD_ID" goto start_backend
:do_web_build
echo [build] web app (NEXT_PUBLIC_API_URL=http://localhost:%BACKEND_PORT%)...
pushd "%ROOT%\web"
if not exist node_modules call npm ci --registry=https://registry.npmjs.org --no-audit --no-fund
set "NEXT_PUBLIC_API_URL=http://localhost:%BACKEND_PORT%"
if not defined NEXT_PUBLIC_PC_URL set "NEXT_PUBLIC_PC_URL=http://localhost:8180/pc"
call npm run build
if errorlevel 1 (
  popd
  echo [build] web FAILED
  exit /b 1
)
popd

:start_backend
curl.exe -s -o nul -m 3 "http://localhost:%BACKEND_PORT%/api/v1/health"
if not errorlevel 1 (
  echo [backend] already running on :%BACKEND_PORT%
  goto start_web
)
echo [backend] starting on :%BACKEND_PORT% ...
start "ProvenPath backend" cmd /k call "%~dp0run-backend.cmd"
set /a PP_WAIT=0
:wait_backend
rem ~2 s pause (ping works even when stdin is redirected, unlike timeout.exe)
ping -n 3 127.0.0.1 >nul
curl.exe -s -o nul -m 3 "http://localhost:%BACKEND_PORT%/api/v1/health"
if not errorlevel 1 goto backend_up
set /a PP_WAIT+=2
if %PP_WAIT% LSS 120 goto wait_backend
echo [backend] not healthy after 120 s; see the "ProvenPath backend" console and %PP_LOGS%\backend.log
exit /b 1
:backend_up
echo [backend] up

:start_web
curl.exe -s -o nul -m 3 "http://localhost:%WEB_PORT%/"
if not errorlevel 1 (
  echo [web] already running on :%WEB_PORT%
  goto start_agent
)
echo [web] starting on :%WEB_PORT% ...
start "ProvenPath web" cmd /k call "%~dp0run-web.cmd"

:start_agent
if not exist "%ROOT%\policycenter\agent\agent.env" (
  echo [agent] NOT started: copy policycenter\agent\agent.env.example to policycenter\agent\agent.env and fill it in.
  goto done
)
powershell -NoProfile -Command "if (Get-CimInstance Win32_Process -Filter \"Name='java.exe'\" | Where-Object { $_.CommandLine -like '*provenpath-pcagent.jar*' }) { exit 0 } else { exit 1 }"
if not errorlevel 1 (
  echo [agent] already running
  goto done
)
echo [agent] starting...
start "ProvenPath PC agent" cmd /k call "%~dp0run-agent.cmd"

:done
echo.
echo Mission Control: http://localhost:%WEB_PORT%   PolicyCenter: http://localhost:8180/pc   Logs: %PP_LOGS%
exit /b 0
