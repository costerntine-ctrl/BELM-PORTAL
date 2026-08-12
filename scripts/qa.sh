#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"

echo "[1/4] PHP syntax"
find backend -type f -name '*.php' -print | sort | while IFS= read -r file; do
  php -l "$file" >/dev/null
done

echo "[2/4] JavaScript syntax (source manager files)"
find frontend -type f -name '*.js' ! -path 'frontend/assets/*' -print | sort | while IFS= read -r file; do
  node --check "$file" >/dev/null
done

echo "[3/4] Required deployment files"
for file in Dockerfile render.yaml backend/schema.sql backend/index.php frontend/index.html; do
  test -f "$file" || { echo "Missing required file: $file" >&2; exit 1; }
done

echo "[4/4] Secret hygiene checks"
if grep -RInE '(SMTP_PASS|JWT_SECRET)=[^[:space:]]+' . --exclude='.env.example' --exclude='*.md' --exclude='*.txt' --exclude-dir='.git' | grep -vE '(getenv|generateValue|key:|JWT_SECRET=replace)' >/dev/null 2>&1; then
  echo "Warning: review possible committed secret values." >&2
fi

echo "BELM QA passed."
