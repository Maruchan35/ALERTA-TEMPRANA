@echo off
rem ALERTA CERCA - inicia el puente de WhatsApp (dejar esta ventana abierta)
cd /d "%~dp0"
if not exist node_modules call npm install
node index.mjs
pause
