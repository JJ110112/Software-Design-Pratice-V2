@echo off
title Software Design Practice - Stop Services

echo ========================================
echo   Stopping All Services
echo ========================================
echo.

echo Stopping API Server...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3333[^0-9]" ^| findstr "LISTENING"') do taskkill /PID %%a /T /F >nul 2>&1

echo Stopping Web Server...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5500[^0-9]" ^| findstr "LISTENING"') do taskkill /PID %%a /T /F >nul 2>&1

timeout /t 2 /nobreak >nul

echo.
echo All services stopped.
echo.
pause
