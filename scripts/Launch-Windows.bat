@echo off
REM Redirige vers le lanceur silencieux (pas de fenetre noire)
start "" wscript //nologo "%~dp0Launch-Windows.vbs"
exit /b 0
