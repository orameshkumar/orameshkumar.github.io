@echo off
echo Starting BuildCalc local server...
echo.
echo Open your browser at: http://localhost:8080
echo Press Ctrl+C to stop the server.
echo.

:: Try Python 3 first
python -m http.server 8080 2>nul
if %errorlevel% neq 0 (
    :: Try Python launcher
    py -m http.server 8080 2>nul
    if %errorlevel% neq 0 (
        echo Python not found. Please install Python from https://python.org
        echo Or install Node.js and run: npx serve .
        pause
    )
)
