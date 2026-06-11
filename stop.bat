@echo off
echo ===================================
echo  BidFlow — Stopping All Services
echo ===================================

:: ── Kill local processes ──────────────────────────────────────────────────────
echo [1/2] Stopping local servers...
taskkill /FI "WINDOWTITLE eq BidFlow Backend*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq BidFlow Frontend*" /F >nul 2>&1
powershell -Command "Get-Process -ErrorAction SilentlyContinue | Where Path -like '*\bidflow\backend\venv\*' | Stop-Process -Force"
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 " 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5000 " 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
)
echo Local servers stopped.

:: ── Stop Docker containers ────────────────────────────────────────────────────
echo [2/2] Stopping Docker containers (MongoDB + Redis)...
docker compose down
echo Docker containers stopped.

echo.
echo ===================================
echo  BidFlow is stopped.
echo ===================================
echo.
pause
