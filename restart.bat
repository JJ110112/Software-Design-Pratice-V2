@echo off
chcp 65001 >nul
title Software Design Practice - 重新啟動

echo ════════════════════════════════════════
echo   重新啟動服務
echo ════════════════════════════════════════
echo.

call "%~dp0stop.bat"
echo.
echo 重新啟動中...
timeout /t 1 /nobreak >nul
call "%~dp0start.bat"
