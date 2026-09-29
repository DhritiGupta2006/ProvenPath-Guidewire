@echo off
rem The backend in this console (started by vm\start-all.cmd). Output is also appended to backend.log.
setlocal EnableExtensions
for %%i in ("%~dp0..") do set "ROOT=%%~fi"
call "%~dp0env.cmd" || exit /b 1
set "PORT=%BACKEND_PORT%"
if not defined DB_MODE set "DB_MODE=embedded"
set "PROVENPATH_RULES_DIR=%ROOT%\rules"
set "PROVENPATH_FIXTURES_DIR=%ROOT%\fixtures"
set "PROVENPATH_EVAL_DIR=%ROOT%\eval"
set "PROVENPATH_TOOLS_DIR=%ROOT%\shared\tools"
set "PROVENPATH_PC_TEMPLATE_DIR=%ROOT%\policycenter\overlay-template"
title ProvenPath backend :%PORT%
"%JAVA_HOME%\bin\java" -jar "%ROOT%\backend\app\build\libs\provenpath-app.jar" 2>&1 | powershell -NoProfile -Command "$input | Tee-Object -FilePath '%PP_LOGS%\backend.log' -Append"
