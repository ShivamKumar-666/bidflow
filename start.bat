@echo off
echo ===================================
echo  BidFlow — Starting All Services
echo ===================================

:: ── Kill any previously running instances on our ports ────────────────────────
echo [0/3] Cleaning up old processes and terminal windows...
taskkill /FI "WINDOWTITLE eq BidFlow Backend*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq BidFlow Frontend*" /F >nul 2>&1
powershell -Command "Get-Process -ErrorAction SilentlyContinue | Where Path -like '*\bidflow\backend\venv\*' | Stop-Process -Force"
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 " 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5000 " 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
)
echo Cleaned up previous runs.

:: ── MongoDB ───────────────────────────────────────────────────────────────────
echo [1/3] Checking MongoDB...
sc query MongoDB | findstr "RUNNING" >nul 2>&1
if errorlevel 1 (
    echo MongoDB not running - attempting to start...
    net start MongoDB >nul 2>&1
    if errorlevel 1 (
        echo Starting MongoDB manually on port 27017...
        if not exist "%~dp0mongodb_data" mkdir "%~dp0mongodb_data"
        if not exist "%~dp0mongodb_log"  mkdir "%~dp0mongodb_log"
        start /B "" "C:\Program Files\MongoDB\Server\8.3\bin\mongod.exe" ^
            --dbpath "%~dp0mongodb_data" ^
            --logpath "%~dp0mongodb_log\mongod.log" ^
            --port 27017 ^
            --bind_ip 127.0.0.1
        ping 127.0.0.1 -n 4 >nul
    )
)
echo MongoDB is ready.

:: ── Backend ───────────────────────────────────────────────────────────────────
echo [2/3] Starting Backend (Flask)...
start "BidFlow Backend" /D "%~dp0backend" cmd /k "venv\Scripts\python.exe app.py"

:: Give the backend 3 seconds to boot before opening the browser
ping 127.0.0.1 -n 4 >nul

:: ── Frontend ──────────────────────────────────────────────────────────────────
echo [3/3] Starting Frontend (Vite)...
start "BidFlow Frontend" /D "%~dp0frontend" cmd /k "npm run dev"

echo.
echo ===================================
echo  BidFlow is starting!
echo  Backend API:  http://localhost:5000
echo  Frontend App: http://localhost:5173
echo ===================================
echo.
echo  TIP: To restart after code changes,
echo  just run start.bat again — it will
echo  automatically kill the old servers first.
echo.
ping 127.0.0.1 -n 5 >nul
start http://localhost:5173
