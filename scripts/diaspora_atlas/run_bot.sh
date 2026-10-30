#!/usr/bin/env bash
# Usage: run_bot.sh <script.py> "<commit/issue label>"
# Runs one Diaspora Atlas data bot, commits changed files in diaspora-atlas/data, and opens a
# GitHub issue when the bot reports something a person should check.
set -euo pipefail
SCRIPT="$1"; LABEL="$2"
export ATLAS_ISSUE_FILE="${RUNNER_TEMP:-/tmp}/diaspora-issue-$$.md"
: > "$ATLAS_ISSUE_FILE"
python "scripts/diaspora_atlas/$SCRIPT"

git config user.name  "diaspora-atlas-bot"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add diaspora-atlas/data
if ! git diff --cached --quiet; then
  git commit -m "Diaspora Atlas: ${LABEL} ($(date -u +%Y-%m-%d))"
  for i in 1 2 3; do git pull --rebase --quiet && git push --quiet && break || sleep 10; done
fi

if [ -s "$ATLAS_ISSUE_FILE" ]; then
  {
    echo
    echo "_Opened automatically by the ${LABEL} bot ([run](${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-}/actions/runs/${GITHUB_RUN_ID:-})). Close when handled. How to act on it: diaspora-atlas/BOTS.md._"
  } >> "$ATLAS_ISSUE_FILE"
  TITLE="Diaspora Atlas: ${LABEL} — $(date -u +%Y-%m-%d)"
  gh label create diaspora-atlas --color 00804a --description "Nigeria Diaspora Atlas bots and suggestions" 2>/dev/null || true
  gh issue create --title "$TITLE" --body-file "$ATLAS_ISSUE_FILE" --label diaspora-atlas \
    || gh issue create --title "$TITLE" --body-file "$ATLAS_ISSUE_FILE"
fi
