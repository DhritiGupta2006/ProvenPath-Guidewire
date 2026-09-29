@echo off
rem Shared settings for the vm\*.cmd scripts. Call it from inside a setlocal block, with ROOT already set.
rem Only OUR processes get Temurin 11 as JAVA_HOME; PolicyCenter keeps its own JDK (passed to the agent as PC_JAVA_HOME).

if not defined PROVENPATH_JAVA_HOME set "PROVENPATH_JAVA_HOME=%LOCALAPPDATA%\Programs\temurin-11"
if not exist "%PROVENPATH_JAVA_HOME%\bin\java.exe" (
  echo Temurin 11 not found at %PROVENPATH_JAVA_HOME%. Set PROVENPATH_JAVA_HOME to a JDK 11.
  exit /b 1
)
if not defined PC_JAVA_HOME if defined JAVA_HOME set "PC_JAVA_HOME=%JAVA_HOME%"
set "JAVA_HOME=%PROVENPATH_JAVA_HOME%"

if not exist "%ROOT%\.env" (
  echo %ROOT%\.env is missing: copy .env.example to .env and fill in the secrets.
  exit /b 1
)
for /f "usebackq eol=# tokens=1,* delims==" %%a in ("%ROOT%\.env") do if not "%%a"=="" set "%%a=%%b"

if not defined BACKEND_PORT set "BACKEND_PORT=8080"
if not defined WEB_PORT set "WEB_PORT=3000"
if not defined EMBEDDED_PG_DIR set "EMBEDDED_PG_DIR=C:\ProvenPath-tools\pgdata"
if not defined PP_LOGS set "PP_LOGS=C:\ProvenPath-backup\logs"
if not exist "%PP_LOGS%" mkdir "%PP_LOGS%"
exit /b 0
