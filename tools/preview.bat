@echo off
cd /d "%~dp0.."
echo Open http://localhost:8000 in your browser. Press Ctrl+C to stop.
py -m http.server 8000
