@echo off
chcp 65001 >nul
title Software Design Practice - 服務管理

echo ════════════════════════════════════════
echo   Software Design Practice 服務啟動中
echo ════════════════════════════════════════
echo.

:: ── 檢查防火牆規則 ──
netsh advfirewall firewall show rule name="SDP-WebServer-5500" >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] 防火牆尚未開放 port 5500，正在新增規則...
    netsh advfirewall firewall add rule name="SDP-WebServer-5500" dir=in action=allow protocol=TCP localport=5500 >nul 2>&1
    if %errorlevel%==0 (
        echo     已開放 port 5500
    ) else (
        echo     [!] 新增失敗，請以系統管理員身分執行此批次檔
    )
) else (
    echo [OK] 防火牆 port 5500 已開放
)

netsh advfirewall firewall show rule name="SDP-APIServer-3333" >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] 防火牆尚未開放 port 3333，正在新增規則...
    netsh advfirewall firewall add rule name="SDP-APIServer-3333" dir=in action=allow protocol=TCP localport=3333 >nul 2>&1
    if %errorlevel%==0 (
        echo     已開放 port 3333
    ) else (
        echo     [!] 新增失敗，請以系統管理員身分執行此批次檔
    )
) else (
    echo [OK] 防火牆 port 3333 已開放
)

echo.

:: ── 檢查 port 是否已被佔用 ──
netstat -ano | findstr ":3333 " | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo [!] API Server (port 3333) 已在執行中，先關閉...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3333 " ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1
    timeout /t 1 /nobreak >nul
)

netstat -ano | findstr ":5500 " | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo [!] Web Server (port 5500) 已在執行中，先關閉...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5500 " ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1
    timeout /t 1 /nobreak >nul
)

:: ── 啟動服務 ──
echo [1/2] 啟動 API Server (port 3333)...
start "API-Server" /min cmd /c "cd /d %~dp0 && node server/server.js"
timeout /t 1 /nobreak >nul

echo [2/2] 啟動 Web Server (port 5500)...
start "Web-Server" /min cmd /c "cd /d %~dp0 && npx serve -l 5500"
timeout /t 2 /nobreak >nul

echo.
echo ════════════════════════════════════════
echo   全部啟動完成！
echo   API Server:  http://localhost:3333
echo   Web Server:  http://localhost:5500
echo ════════════════════════════════════════
echo.
echo 按任意鍵開啟瀏覽器...
pause >nul
start http://localhost:5500
