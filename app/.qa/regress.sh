#!/bin/zsh
# Full regression: typecheck, route sweep, every interaction suite, scope rules.
# Run from app/ with the dev server on :5181.
set -u
cd "$(dirname "$0")/.." || exit 1
fail=0
step() { echo "== $1"; }
step typecheck; npx tsc -b || fail=1
step routes;    node .qa/all.mjs | tail -1 || fail=1
# digital twin is signed off: its (slow, software-GL) tests are not part of the routine suite
for f in site-interact ne-interact ops-flow wall; do
  step "$f"
  out=$(node .qa/$f.mjs 2>&1)
  p=$(echo "$out" | grep -c '^PASS'); q=$(echo "$out" | grep -c '^FAIL')
  echo "   $p pass, $q fail"
  if [[ $q -gt 0 || $p -eq 0 ]]; then fail=1; echo "$out" | grep -E '^FAIL|Error|rror:' | head -5; fi
done
step scope; npx -y tsx .qa/scope-check.ts | tail -1 || fail=1
step heights; node .qa/heights.mjs | cut -c1-110
[[ $fail -eq 0 ]] && echo "ALL GREEN" || { echo "REGRESSION FAILED"; exit 1; }
