#!/bin/sh
# Runs the site on your computer at http://localhost:8000
cd "$(dirname "$0")/.." || exit 1
printf "Open http://localhost:8000 in your browser. Press Ctrl+C to stop.\n"
exec python3 -m http.server 8000
