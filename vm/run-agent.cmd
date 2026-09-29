@echo off
rem The ProvenPath PC agent in this console (it writes its own log: LOG_DIR\pcagent.log).
rem PolicyCenter processes it starts get PC_JAVA_HOME (PolicyCenter's own JDK), never Temurin.
setlocal EnableExtensions
for %%i in ("%~dp0..") do set "ROOT=%%~fi"
call "%~dp0env.cmd" || exit /b 1
title ProvenPath PC agent
"%JAVA_HOME%\bin\java" -jar "%ROOT%\backend\pcagent\build\libs\provenpath-pcagent.jar" "%ROOT%\policycenter\agent\agent.env"
