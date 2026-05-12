#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
exec python3 -m uvicorn src.main:app --host "${HOST:-0.0.0.0}" --port "${PORT:-8000}" --workers "${WORKERS:-2}" --no-access-log
