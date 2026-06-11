@echo off
echo ===================================
echo  BidFlow — Starting All Services
echo ===================================
echo.
echo  NOTE: Make sure Docker Desktop is running!
echo  (Check the system tray for the Docker whale icon)
echo.

:: ── Kill any previously running instances on our ports ────────────────────────
echo [0/4] Cleaning up old processes and terminal windows...
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

:: ── Docker readiness check ────────────────────────────────────────────────────
echo [1/4] Waiting for Docker Desktop to be ready...
set /a retries=0
:check_docker
docker ps >nul 2>&1
if %errorlevel% neq 0 goto docker_not_ready
goto docker_ready
:docker_not_ready
set /a retries=%retries%+1
if %retries% GEQ 15 goto docker_timeout
echo   Waiting for Docker... (%retries%/15)
timeout /t 2 /nobreak >nul
goto check_docker
:docker_timeout
echo.
echo  ERROR: Docker Desktop not ready after 30 seconds.
echo  Open Docker Desktop and wait for "Engine running" (green), then try again.
echo.
pause
exit /b 1
:docker_ready
echo Docker is ready!

:: ── Docker DBs (MongoDB + Redis) ─────────────────────────────────────────────
echo Starting Docker databases (MongoDB + Redis)...
docker compose up -d mongodb redis
if errorlevel 1 (
    echo.
    echo  ERROR: Docker compose failed.
    echo.
    pause
    exit /b 1
)

echo Waiting for databases to be healthy...
:wait_mongo
docker compose ps mongodb | findstr "healthy" >nul 2>&1
if errorlevel 1 (
    timeout /t 2 /nobreak >nul
    goto wait_mongo
)
echo MongoDB is healthy.

:wait_redis
docker compose ps redis | findstr "healthy" >nul 2>&1
if errorlevel 1 (
    timeout /t 2 /nobreak >nul
    goto wait_redis
)
echo Redis is healthy.

:: ── Backend ───────────────────────────────────────────────────────────────────
echo [2/4] Starting Backend (Flask)...
start "BidFlow Backend" /D "%~dp0backend" cmd /k "venv\Scripts\python.exe app.py"

:: Give the backend 3 seconds to boot
ping 127.0.0.1 -n 4 >nul

:: ── Frontend ─────────────────────────────────────────────────────────────────
echo [3/4] Starting Frontend (Vite)...
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
echo  TIP: To stop everything, run stop.bat
echo.
ping 127.0.0.1 -n 5 >nul
start http://localhost:5173
