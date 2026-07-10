@echo off
title SWARM Backend - DO NOT CLOSE THIS WINDOW
color 0A
echo.
echo ============================================
echo   SWARM BACKEND STARTING...
echo ============================================
echo.
echo Please WAIT 2-5 minutes on first run.
echo When you see "Started PlantMonitoringApplication" = READY!
echo.
echo DO NOT CLOSE THIS WINDOW while using SWARM.
echo.
cd /d "%~dp0backend"
call mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=dev"
pause
