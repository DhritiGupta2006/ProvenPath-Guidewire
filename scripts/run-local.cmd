@echo off
rem ProvenPath backend WITHOUT Docker (laptops and the Guidewire VM): JDK 11 + embedded PostgreSQL.
rem   Usage: scripts\run-local.cmd            (builds the jar incrementally, then starts it)
rem          scripts\run-local.cmd --no-build
rem Needs: a JDK 11 (set PROVENPATH_JAVA_HOME, or JAVA_HOME) and .env in the repo root (copy .env.example).
setlocal EnableExtensions
for %%i in ("%~dp0..") do set "ROOT=%%~fi"
if exist "%ROOT%\.env" for /f "usebackq eol=# tokens=1,* delims==" %%a in ("%ROOT%\.env") do if not "%%a"=="" set "%%a=%%b"
if defined PROVENPATH_JAVA_HOME set "JAVA_HOME=%PROVENPATH_JAVA_HOME%"
if not defined JAVA_HOME (echo Set PROVENPATH_JAVA_HOME or JAVA_HOME to a JDK 11 & exit /b 1)
if not defined PROVENPATH_GATE_SECRET (echo PROVENPATH_GATE_SECRET missing: copy .env.example to .env & exit /b 1)
if "%~1"=="--no-build" goto run
call "%ROOT%\backend\gradlew.bat" -p "%ROOT%\backend" :app:fatJar --no-daemon -q
if errorlevel 1 (echo Build failed & exit /b 1)
:run
if not defined PORT if defined BACKEND_PORT set "PORT=%BACKEND_PORT%"
if not defined DB_MODE set "DB_MODE=embedded"
if not defined EMBEDDED_PG_DIR set "EMBEDDED_PG_DIR=%ROOT%\.provenpath-pgdata"
set "PROVENPATH_RULES_DIR=%ROOT%\rules"
set "PROVENPATH_FIXTURES_DIR=%ROOT%\fixtures"
set "PROVENPATH_EVAL_DIR=%ROOT%\eval"
"%JAVA_HOME%\bin\java" -jar "%ROOT%\backend\app\build\libs\provenpath-app.jar"
