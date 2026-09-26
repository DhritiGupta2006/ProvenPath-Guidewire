#!/usr/bin/env bash
# End-to-end smoke test of a running backend (docker compose up, or vm\start-all.cmd).
# Usage: bash scripts/smoke.sh [base_url]     default http://localhost:${BACKEND_PORT:-8080}
set -euo pipefail
BASE="${1:-http://localhost:${BACKEND_PORT:-8080}}/api/v1"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
j() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s);console.log(eval('o'+process.argv[1]))})" "$1"; }

echo "== health";  curl -sf "$BASE/health" | j '.status'
echo "== rules";   curl -sf "$BASE/rules" | j '.count'

# Body from a UTF-8 file: passing ₹ as a command-line argument gets mangled on Windows.
printf '{"prompt":"Cyber insurance for Indian startups, up to ₹50L coverage"}' > "$TMP/prompt.json"
EXEC=$(curl -sf -X POST "$BASE/executions" -H 'Content-Type: application/json' --data-binary @"$TMP/prompt.json" | j '.executionId')
echo "== execution $EXEC"

echo "== SSE stream (verify.node events hidden; stops at review.requested / run.completed or 90s)"
timeout 90 curl -sN -H 'Accept: text/event-stream' "$BASE/executions/$EXEC/stream" | grep --line-buffered '^data:' \
  | node -e "const rl=require('readline').createInterface({input:process.stdin});rl.on('line',l=>{const e=JSON.parse(l.slice(5));
      if(e.type!=='verify.node')console.log(String(e.seq).padStart(4),e.type,JSON.stringify(e.payload).slice(0,110));
      if(e.type==='review.requested'||e.type==='run.completed')process.exit(0)})" || true

STATUS=$(curl -sf "$BASE/executions/$EXEC" | j '.status'); echo "== status: $STATUS"
RUN=$(curl -sf "$BASE/executions/$EXEC" | j '.latestRunId')
REVIEWER=$(curl -sf "$BASE/users" | j '.find(u=>u.role==="reviewer").id')
echo "== replay (identical verdict hash?)"; curl -sf -X POST "$BASE/executions/$EXEC/replay" | j '.match'
echo "== approve as the named reviewer"
curl -sf -X POST "$BASE/reviews" -H 'Content-Type: application/json' \
  -d "{\"executionId\":\"$EXEC\",\"runId\":\"$RUN\",\"reviewerId\":\"$REVIEWER\",\"decision\":\"approve\"}" | j '.status'
echo "== deploy (503 until :pcexport is wired; then 202 queued for the VM agent)"
CODE=$(curl -s -o "$TMP/deploy.json" -w '%{http_code}' -X POST "$BASE/deployments" -H 'Content-Type: application/json' \
  -d "{\"executionId\":\"$EXEC\"}")
echo "$CODE $(cat "$TMP/deploy.json")"
echo "== metrics"; curl -sf "$BASE/metrics" | j '.falsePassCount + "/" + o.falsePassDenominator + " false-pass"'
