@echo off
call install.bat
:loop
node server.js
echo.
echo [SERVER CRASHED] Restarting in 5 seconds... press Ctrl+C to stop.
timeout /t 5

goto loop
