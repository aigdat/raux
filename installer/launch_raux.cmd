@echo off
REM Batch script to launch RAUX and Lemonade
REM This script runs both servers, waits for them to be ready, and opens the browser

REM Set version with default value
if "%RAUX_VERSION%"=="" (
    set "RAUX_VERSION= "
) else (
    set "RAUX_VERSION= %RAUX_VERSION%"
)

REM Set paths
set "PYTHON_PATH=%LOCALAPPDATA%\RAUX\python\python.exe"
set "RAUX_URL=http://localhost:8080"
set "LEMONADE_URL=http://localhost:8000"

REM Verify Python executable exists
if not exist "%PYTHON_PATH%" (
    echo ERROR: Python executable not found at %PYTHON_PATH%
    echo Please ensure RAUX is properly installed.
    pause
    exit /b 1
)

REM Start PowerShell script
powershell -ExecutionPolicy Bypass -File "%~dp0launch_raux.ps1"