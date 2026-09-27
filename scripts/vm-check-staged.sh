#!/usr/bin/env bash
# Safety gate for commits made on the Guidewire VM (the repo is PUBLIC).
# Run after `git add`, before `git commit`. Prints OK or explains what to unstage.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
ALLOWED='^(comms/from-vm/|policycenter/)'
fail=0
files=$(git diff --cached --name-only --diff-filter=ACMR)
if [ -z "$files" ]; then echo "Nothing staged."; exit 1; fi
while IFS= read -r f; do
  if ! [[ "$f" =~ $ALLOWED ]]; then
    echo "NOT ALLOWED (outside comms/from-vm/ and policycenter/): $f"; fail=1; continue
  fi
  case "$f" in
    *.jar|*.class|*.war|*.zip|*.env|*agent.env|*.pem|*.key) echo "NOT ALLOWED (binary/secret type): $f"; fail=1; continue;;
  esac
  content=$(git show ":$f" 2>/dev/null)
  if grep -qiE 'Copyright[^\n]{0,40}Guidewire|Guidewire Software, Inc|All rights reserved' <<<"$content"; then
    echo "LOOKS LIKE A GUIDEWIRE FILE (copyright header): $f"; fail=1
  fi
  if grep -qE 'EC2AMAZ-|PROVENPATH_GATE_SECRET=.{8,}|PC_AGENT_KEY=.{4,}|GEMINI_API_KEY=.{10,}|ghp_[A-Za-z0-9]{20,}|github_pat_' <<<"$content"; then
    echo "LOOKS LIKE A SECRET OR HOSTNAME: $f"; fail=1
  fi
  if grep -qE '(^|[^A-Za-z])(C:\\GW10|C:/GW10)[^ ]*\.(xml|gs|gsx|eti|etx|pcf|gwp)' <<<"$content" && [[ "$f" == policycenter/* ]]; then
    : # paths are fine to mention in our own overlay docs
  fi
done <<<"$files"
if [ $fail -ne 0 ]; then echo "BLOCKED: unstage the files above (git restore --staged <file>) and fix them."; exit 1; fi
echo "OK: $(wc -l <<<"$files" | tr -d ' ') staged file(s) are safe to commit."
