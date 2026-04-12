@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "EXIT_CODE=0"
set "SCRIPT_DIR=%~dp0"
set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
set "PUBLISH_PS1=%SCRIPT_DIR%publish-all-wikis.ps1"
set "SERVICE_ACCOUNT_HINT_FILE=%SCRIPT_DIR%publish-service-account.path"

if not exist "%PUBLISH_PS1%" (
    echo [ERROR] No se encontro: %PUBLISH_PS1%
    set "EXIT_CODE=1"
    goto :end
)

set "SERVICE_ACCOUNT_PATH=%FIREBASE_SERVICE_ACCOUNT%"
if "%SERVICE_ACCOUNT_PATH%"=="" (
    if exist "%SERVICE_ACCOUNT_HINT_FILE%" (
        set /p SERVICE_ACCOUNT_PATH=<"%SERVICE_ACCOUNT_HINT_FILE%"
    )
)

if "%SERVICE_ACCOUNT_PATH%"=="" (
    if exist "%SCRIPT_DIR%firebase-service-account.json" (
        set "SERVICE_ACCOUNT_PATH=%SCRIPT_DIR%firebase-service-account.json"
    )
)

if "%SERVICE_ACCOUNT_PATH%"=="" (
    set "SERVICE_ACCOUNT_PATH=C:\Users\andro\secrets\firebase-service-account.json"
)
set "SERVICE_ACCOUNT_PATH=%SERVICE_ACCOUNT_PATH:"=%"

echo.
echo ==========================================
echo Publicando cambios desde Firebase...
echo ==========================================
echo.

if exist "%SERVICE_ACCOUNT_PATH%" (
    echo Usando Service Account: %SERVICE_ACCOUNT_PATH%
    > "%SERVICE_ACCOUNT_HINT_FILE%" echo %SERVICE_ACCOUNT_PATH%
    "%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%PUBLISH_PS1%" -ServiceAccount "%SERVICE_ACCOUNT_PATH%"
) else (
    echo No se encontro Service Account automaticamente.
    echo.
    set /p SERVICE_ACCOUNT_PATH=Introduce la ruta completa del service account JSON. Enter para cancelar: 
    set "SERVICE_ACCOUNT_PATH=!SERVICE_ACCOUNT_PATH:"=!"
    if "!SERVICE_ACCOUNT_PATH!"=="" (
        echo.
        echo [ERROR] Publicacion cancelada: falta service account.
        set "EXIT_CODE=1"
        goto :end
    )
    if not exist "!SERVICE_ACCOUNT_PATH!" (
        echo.
        echo [ERROR] El archivo no existe: !SERVICE_ACCOUNT_PATH!
        set "EXIT_CODE=1"
        goto :end
    )
    > "%SERVICE_ACCOUNT_HINT_FILE%" echo !SERVICE_ACCOUNT_PATH!
    echo.
    echo Usando Service Account: !SERVICE_ACCOUNT_PATH!
    "%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%PUBLISH_PS1%" -ServiceAccount "!SERVICE_ACCOUNT_PATH!"
)

set "EXIT_CODE=%ERRORLEVEL%"
echo.
if "%EXIT_CODE%"=="0" (
    echo [OK] Publicacion finalizada sin errores.
) else (
    echo [ERROR] La publicacion termino con codigo %EXIT_CODE%.
)

:end
echo.
if /I "%~1"=="--no-pause" (
    exit /b %EXIT_CODE%
)
pause
exit /b %EXIT_CODE%
