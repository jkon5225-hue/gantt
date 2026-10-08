@echo off

set "APP_DIR=%~dp0"

start "Node Server" cmd /k "cd /d "%APP_DIR%" && node server.js"
start "Vite Dev Server" cmd /k "cd /d "%APP_DIR%\src" && npm run dev"