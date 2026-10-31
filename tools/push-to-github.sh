#!/bin/sh
# Pushes this folder to https://github.com/izzyallen876/izzyallen876.github.io
# Before you run it:
#   1. Create an EMPTY public repository with that exact name on GitHub.
#   2. Tell git who you are. To keep your real email private, use GitHub's no-reply address
#      (GitHub, Settings, Emails, "Keep my email addresses private"):
#        git config --global user.name  "Israel Allen"
#        git config --global user.email "YOUR-NUMBER+izzyallen876@users.noreply.github.com"
set -e
cd "$(dirname "$0")/.."
if [ -z "$(git config user.email)" ]; then
  echo "git doesn't know your email yet. Read the comments at the top of this file, then run it again."
  exit 1
fi
if ! grep -q "TO FILL IN" ASSETS.md 2>/dev/null; then :; else
  echo "Reminder: ASSETS.md still says TO FILL IN for the two images. Fill it in or replace them first."
  printf "Push anyway? [y/N] "; read ans; [ "$ans" = "y" ] || exit 1
fi
[ -d .git ] || git init
git add -A
git commit -m "Launch personal site" || true
git branch -M main
git remote remove origin 2>/dev/null || true
git remote add origin https://github.com/izzyallen876/izzyallen876.github.io.git
git push -u origin main
echo "Pushed. Now finish the Pages and DNS steps in README.md."
