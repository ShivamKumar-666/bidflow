@echo off
:: BidFlow — MongoDB Backup Wrapper
:: Activates the Python venv and runs backup.py
:: Schedule this with Windows Task Scheduler for automated daily backups.

echo [BidFlow Backup] Starting...

cd /d "%~dp0backend"
call venv\Scripts\activate
python backup.py

if errorlevel 1 (
    echo [BidFlow Backup] FAILED. Check the output above for details.
    exit /b 1
)

echo [BidFlow Backup] Done.
