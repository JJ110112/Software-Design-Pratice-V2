@echo off
title Software Design Practice - Status

echo ========================================
echo   Service Status
echo ========================================
echo.

set API_STATUS=STOPPED
set WEB_STATUS=STOPPED

for /f %%a in ('netstat -ano ^| findstr ":3333[^0-9]" ^| findstr "LISTENING"') do set API_STATUS=RUNNING
for /f %%a in ('netstat -ano ^| findstr ":5500[^0-9]" ^| findstr "LISTENING"') do set WEB_STATUS=RUNNING

echo   API Server (port 3333):  %API_STATUS%
echo   Web Server (port 5500):  %WEB_STATUS%

echo.
pause
