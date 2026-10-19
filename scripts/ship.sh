#!/usr/bin/env bash
# Commit, push and deploy to Vercel production in one go (user, 19-Oct-2026: "save tokens").
#
#   scripts/ship.sh -m "message" [-c "string in the new build"] [paths…]
#
#   -m  commit message (required unless -d)
#   -c  verify: the live site's JS must contain this string after the deploy
#   -d  deploy only (no commit / push): deploys HEAD as it is
#   paths  files to commit; none = every modified tracked file + new files under app/src, docs, app/public, scripts
#          (app/package-lock.json is never committed unless named)
#
# Steps: production type-check (tsc -b) → commit → push → deploy HEAD from a clean worktree at the repo root
# (Vercel Root Directory = app) → wait for Ready → optional string check → remove the worktree.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
MSG="" CHECK="" DEPLOY_ONLY=0
while getopts "m:c:d" o; do case $o in m) MSG=$OPTARG ;; c) CHECK=$OPTARG ;; d) DEPLOY_ONLY=1 ;; *) exit 2 ;; esac; done
shift $((OPTIND - 1))
SITE="https://datacenter-ideation.vercel.app"
say() { printf '\033[1;34m▸ %s\033[0m\n' "$*"; }

if [ "$DEPLOY_ONLY" = 0 ]; then
  [ -n "$MSG" ] || { echo "need -m \"message\""; exit 2; }
  say "type-check (tsc -b)"
  (cd app && npx tsc -b)
  if [ $# -gt 0 ]; then git add -- "$@"
  else
    git add -u -- . ':!app/package-lock.json'
    git ls-files --others --exclude-standard -- app/src docs app/public scripts CLAUDE.md | grep -v '/~\$' | xargs -r git add --
  fi
  git diff --cached --quiet && { echo "nothing staged"; exit 1; }
  git diff --cached --stat | tail -1
  git commit -q -m "$MSG" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  say "push $(git log --oneline -1)"
  git push -q origin HEAD:main
fi

WT="${TMPDIR:-/tmp}/dco-deploy-$$"
trap 'git -C "$ROOT" worktree remove --force "$WT" 2>/dev/null || true' EXIT
git worktree prune
git worktree add -q --detach "$WT" HEAD
cp -R app/.vercel "$WT/"
say "deploy $(git rev-parse --short HEAD) to Vercel"
URL=$(cd "$WT" && npx --yes vercel@59 deploy --prod --yes 2>/dev/null | grep -Eo 'https://datacenter-ideation-[a-z0-9]+-[^ "]+\.vercel\.app' | head -1)
[ -n "$URL" ] || { echo "deploy failed (no URL)"; exit 1; }
for i in $(seq 1 30); do
  S=$(npx --yes vercel@59 inspect "$URL" 2>&1 | grep -m1 -i 'status' || true)
  echo "$S" | grep -qi ready && break
  echo "$S" | grep -qi error && { echo "build failed: $URL"; exit 1; }
  sleep 15
done
say "ready: $URL"

if [ -n "$CHECK" ]; then
  MAIN=$(curl -s "$SITE/" | grep -o '/assets/index-[^"]*\.js' | head -1)
  FOUND=""
  for f in "$MAIN" $(curl -s "$SITE$MAIN" | grep -o 'assets/[A-Za-z0-9_-]*\.js' | sort -u | sed 's#^#/#'); do
    curl -s "$SITE$f" | grep -qF -- "$CHECK" && { FOUND=$f; break; }
  done
  [ -n "$FOUND" ] && say "live: \"$CHECK\" found in $FOUND" || { echo "NOT live yet: \"$CHECK\""; exit 1; }
fi
