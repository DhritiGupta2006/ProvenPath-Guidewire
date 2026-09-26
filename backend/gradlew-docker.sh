#!/usr/bin/env bash
# Run Gradle inside Docker with JDK 11 — no local Gradle or JDK needed.
# Usage: bash backend/gradlew-docker.sh test
#        bash backend/gradlew-docker.sh :eval:run
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
WIN_PATH="C:/Users/shaur/Documents/ProvenPathGuidewire"
if command -v cygpath >/dev/null 2>&1; then
  WIN_PATH="$(cygpath -m "$REPO_ROOT")"
fi

MSYS_NO_PATHCONV=1 docker run --rm \
  -v "${WIN_PATH}:/work" \
  -v provenpath-gradle-cache:/home/gradle/.gradle \
  -w /work/backend \
  -e PROVENPATH_RULES_DIR=/work/rules \
  -e PROVENPATH_GATE_SECRET=test-secret \
  gradle:8.10-jdk11 \
  gradle "$@" --no-daemon
