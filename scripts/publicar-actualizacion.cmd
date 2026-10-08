@echo off
rem =============================================================================
rem ALERTA CERCA · publicar una actualizacion de la app SIN reinstalar (Shorebird).
rem
rem Los telefonos que ya tienen instalada la version 1.0.0 descargan el parche solos al
rem abrir la app y lo aplican la siguiente vez que la abren. No hay que compartir otra APK.
rem
rem Uso (desde cualquier carpeta):   scripts\publicar-actualizacion.cmd
rem
rem Solo sirve para cambios en el codigo Dart (pantallas, textos, logica). Si cambias permisos,
rem plugins, el AndroidManifest o la configuracion de Firebase, hace falta una version nueva:
rem sube "version:" en app\pubspec.yaml y crea un release (ver docs\despliegue.md, paso 5b).
rem =============================================================================
setlocal
cd /d "%~dp0..\app" || exit /b 1

if not exist config.json (
  echo Falta app\config.json ^(URL y publishable key de Supabase^). Copia config.ejemplo.json.
  exit /b 1
)

rem Shorebird en el PATH o, si no, en D:\dev\shorebird. Se llama a su script de PowerShell
rem directamente para que Windows no parta los argumentos que llevan "=" o comas.
set "SB=D:\dev\shorebird\bin\shorebird.ps1"
for /f "delims=" %%i in ('where shorebird.ps1 2^>nul') do set "SB=%%i"

powershell -NoProfile -ExecutionPolicy Bypass -File "%SB%" patch android "--dart-define-from-file=config.json"
