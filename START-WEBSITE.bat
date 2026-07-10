@echo off
title SWARM Website - DO NOT CLOSE THIS WINDOW
color 0B
echo.
echo ============================================
echo   SWARM WEBSITE STARTING...
echo ============================================
echo.
cd /d "%~dp0frontend"
if not exist node_modules (
    echo Installing packages first time... please wait...
    call npm install
)
echo.
echo When you see "Local: http://localhost:3000" = OPEN THAT IN BROWSER!
echo.
call npm run dev
pause
