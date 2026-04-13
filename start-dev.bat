@echo off
REM Uses npm.cmd so this works when PowerShell blocks npm.ps1 (ExecutionPolicy).
cd /d "%~dp0backend"
start "AGC Backend" cmd /k "npm.cmd run dev"
cd /d "%~dp0frontend"
start "AGC Frontend" cmd /k "npm.cmd run dev"
echo Two windows should open: backend :5000 and frontend :5173
echo App: http://localhost:5173
pause
