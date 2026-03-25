@echo off
title Software Design Practice - Service Manager

echo ========================================
echo   Software Design Practice - Starting
echo ========================================
echo.

:: -- Check firewall rules --
netsh advfirewall firewall show rule name="SDP-WebServer-5500" >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Firewall port 5500 not open, adding rule...
    netsh advfirewall firewall add rule name="SDP-WebServer-5500" dir=in action=allow protocol=TCP localport=5500 >nul 2>&1
)

netsh advfirewall firewall show rule name="SDP-APIServer-3333" >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Firewall port 3333 not open, adding rule...
    netsh advfirewall firewall add rule name="SDP-APIServer-3333" dir=in action=allow protocol=TCP localport=3333 >nul 2>&1
)

echo.

:: -- Kill existing services --
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3333[^0-9]" ^| findstr "LISTENING"') do (
    echo [!] API Server port 3333 already running, stopping...
    taskkill /PID %%a /T /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5500[^0-9]" ^| findstr "LISTENING"') do (
    echo [!] Web Server port 5500 already running, stopping...
    taskkill /PID %%a /T /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: -- Start services --
echo [1/2] Starting API Server (port 3333)...
start "API-Server" /min cmd /c "cd /d %~dp0 && node server/server.js"
timeout /t 1 /nobreak >nul

echo [2/2] Starting Web Server (port 5500)...
start "Web-Server" /min cmd /c "cd /d %~dp0 && npx serve -l 5500"
timeout /t 2 /nobreak >nul

echo.
echo ========================================
echo   All services started!
echo   API Server:  http://localhost:3333
echo   Web Server:  http://localhost:5500
echo ========================================
echo.
echo Press any key to open browser...
pause >nul
start http://localhost:5500
