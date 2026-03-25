@echo off
chcp 65001 >nul
title Software Design Practice - 停止服務

echo ════════════════════════════════════════
echo   停止所有服務
echo ════════════════════════════════════════
echo.

set found=0

netstat -ano | findstr ":3333 " | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo [x] 關閉 API Server (port 3333)...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3333 " ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1
    set found=1
) else (
    echo [_] API Server 未在執行
)

netstat -ano | findstr ":5500 " | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo [x] 關閉 Web Server (port 5500)...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5500 " ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1
    set found=1
) else (
    echo [_] Web Server 未在執行
)

echo.
echo 全部服務已停止。
timeout /t 2 >nul
