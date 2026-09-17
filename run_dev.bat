@echo off
title NEXUS AGENT DEV
cd /d D:\Agent
echo ========================================================
echo   NEXUS AGENT - Starting Desktop Dev Server
echo ========================================================
echo.
call "C:\Program Files\nodejs\npm.cmd" run dev
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Dev server exited with code %ERRORLEVEL%
)
pause
