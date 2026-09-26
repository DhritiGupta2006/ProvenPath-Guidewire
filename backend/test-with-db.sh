#!/usr/bin/env bash
# Runs the backend test suite (incl. :app integration tests) against a throwaway PostgreSQL 16 container.
# Usage: bash backend/test-with-db.sh [gradle tasks...]   (default: test)
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
WIN_PATH="$REPO_ROOT"
if command -v cygpath >/dev/null 2>&1; then WIN_PATH="$(cygpath -m "$REPO_ROOT")"; fi
NET=provenpath-test-net
PG=provenpath-test-pg
TASKS=("$@"); [ ${#TASKS[@]} -eq 0 ] && TASKS=(test)

cleanup() { docker rm -f "$PG" >/dev/null 2>&1 || true; docker network rm "$NET" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup
docker network create "$NET" >/dev/null
docker run -d --name "$PG" --network "$NET" -e POSTGRES_DB=provenpath_test -e POSTGRES_USER=provenpath \
  -e POSTGRES_PASSWORD=provenpath postgres:16 >/dev/null
for _ in $(seq 1 60); do docker exec "$PG" pg_isready -U provenpath -d provenpath_test >/dev/null 2>&1 && break; sleep 1; done

MSYS_NO_PATHCONV=1 docker run --rm --network "$NET" \
  -v "${WIN_PATH}:/work" -v provenpath-gradle-cache:/home/gradle/.gradle -w /work/backend \
  -e PROVENPATH_GATE_SECRET=test-secret \
  -e PROVENPATH_TEST_DB_URL="jdbc:postgresql://${PG}:5432/provenpath_test" \
  -e PROVENPATH_TEST_DB_USER=provenpath -e PROVENPATH_TEST_DB_PASSWORD=provenpath \
  gradle:8.10-jdk11 gradle "${TASKS[@]}" --no-daemon
