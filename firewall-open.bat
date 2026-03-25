@echo off
chcp 65001 >nul
echo ════════════════════════════════════════
echo   開放防火牆 (需要系統管理員權限)
echo ════════════════════════════════════════
echo.

netsh advfirewall firewall add rule name="SDP-WebServer-5500" dir=in action=allow protocol=TCP localport=5500
netsh advfirewall firewall add rule name="SDP-APIServer-3333" dir=in action=allow protocol=TCP localport=3333

echo.
echo 防火牆規則已新增！
echo   Port 5500 (Web Server) - 已開放
echo   Port 3333 (API Server) - 已開放
pause
