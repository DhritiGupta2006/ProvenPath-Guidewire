#!/usr/bin/env bash
# Stops the local backend cleanly (its embedded PostgreSQL stops with it).
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -f "$ROOT/.env" ]; then set -a; . <(tr -d '\r' < "$ROOT/.env"); set +a; fi
curl -s -X POST "http://localhost:${PORT:-${BACKEND_PORT:-8080}}/api/v1/admin/shutdown"; echo
