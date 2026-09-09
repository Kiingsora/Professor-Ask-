@echo off
setlocal
cd /d "%~dp0"

echo [Professor Ask] Bridge auto-reload actif.
echo [Professor Ask] Un git pull qui modifie bridge/ redemarrera automatiquement le serveur.
echo [Professor Ask] Pour arreter: Ctrl+C

echo.
node --watch-path=. --watch-preserve-output server.js

if errorlevel 1 (
  echo.
  echo [Professor Ask] Le bridge s'est arrete avec une erreur.
  echo Verifie que Node.js 20+ est installe: node --version
  pause
)
