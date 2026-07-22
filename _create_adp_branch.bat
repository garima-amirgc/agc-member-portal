@echo off
cd /d "%~dp0"

echo Creating branch feature/adp-profile-integration...
git checkout -b feature/adp-profile-integration

echo Staging ADP files...
git add backend/src/services/adp.service.js
git add backend/src/routes/adp.routes.js
git add backend/src/server.js
git add frontend/src/pages/ProfilePage.jsx
git add backend/.env.example

echo Committing...
git commit -m "feat: ADP Workforce Now integration for profile page"

echo Pushing to GitHub...
git push origin feature/adp-profile-integration

echo.
echo Done! Branch feature/adp-profile-integration is now on GitHub.
echo Next: start the backend and frontend, open your profile page, and test.
pause
