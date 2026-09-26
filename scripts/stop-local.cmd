@echo off
rem Stops the local backend cleanly (its embedded PostgreSQL stops with it). Usage: scripts\stop-local.cmd
setlocal
for %%i in ("%~dp0..") do set "ROOT=%%~fi"
if exist "%ROOT%\.env" for /f "usebackq eol=# tokens=1,* delims==" %%a in ("%ROOT%\.env") do if not "%%a"=="" set "%%a=%%b"
if not defined PORT if defined BACKEND_PORT set "PORT=%BACKEND_PORT%"
if not defined PORT set "PORT=8080"
curl.exe -s -X POST http://localhost:%PORT%/api/v1/admin/shutdown
echo.
