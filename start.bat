@echo off
echo Starting BidFlow Servers...

start cmd /k "cd backend && .\venv\Scripts\activate && python app.py"
start cmd /k "cd frontend && npm run dev"

echo Backend and Frontend servers are starting in separate windows.
echo - Backend API will run on http://localhost:5000
echo - Frontend App will run on http://localhost:5173
