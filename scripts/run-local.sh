#!/usr/bin/env bash
# ProvenPath backend WITHOUT Docker: JDK 11 + embedded PostgreSQL.
#   Usage: bash scripts/run-local.sh [--no-build]
# Needs: a JDK 11 (PROVENPATH_JAVA_HOME or JAVA_HOME) and .env in the repo root (copy .env.example).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -f "$ROOT/.env" ]; then set -a; . <(tr -d '\r' < "$ROOT/.env"); set +a; fi
export JAVA_HOME="${PROVENPATH_JAVA_HOME:-${JAVA_HOME:?Set PROVENPATH_JAVA_HOME or JAVA_HOME to a JDK 11}}"
: "${PROVENPATH_GATE_SECRET:?PROVENPATH_GATE_SECRET missing: copy .env.example to .env}"
if [ "${1:-}" != "--no-build" ]; then (cd "$ROOT/backend" && ./gradlew :app:fatJar --no-daemon -q); fi
export PORT="${PORT:-${BACKEND_PORT:-8080}}" DB_MODE="${DB_MODE:-embedded}"
export EMBEDDED_PG_DIR="${EMBEDDED_PG_DIR:-$ROOT/.provenpath-pgdata}"
export PROVENPATH_RULES_DIR="$ROOT/rules" PROVENPATH_FIXTURES_DIR="$ROOT/fixtures" PROVENPATH_EVAL_DIR="$ROOT/eval" PROVENPATH_PC_TEMPLATE_DIR="$ROOT/policycenter/overlay-template"
exec "$JAVA_HOME/bin/java" -jar "$ROOT/backend/app/build/libs/provenpath-app.jar"
