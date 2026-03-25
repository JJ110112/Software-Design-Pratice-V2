@echo off
chcp 65001 >nul
title Software Design Practice - 服務狀態

echo ════════════════════════════════════════
echo   服務狀態
echo ════════════════════════════════════════
echo.

netstat -ano | findstr ":3333 " | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo   API Server (port 3333):  執行中
) else (
    echo   API Server (port 3333):  未執行
)

netstat -ano | findstr ":5500 " | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo   Web Server (port 5500):  執行中
) else (
    echo   Web Server (port 5500):  未執行
)

echo.
pause
