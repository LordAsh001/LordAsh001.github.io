#!/usr/bin/env bash
# Usage: run_bot.sh <script.py> "<commit/issue label>"
# Runs one History Atlas data bot, commits changed files in history-atlas/data, and opens a
# GitHub issue when the bot reports something a person should check.
set -euo pipefail
SCRIPT="$1"; LABEL="$2"
export ATLAS_ISSUE_FILE="${RUNNER_TEMP:-/tmp}/history-issue-$$.md"
: > "$ATLAS_ISSUE_FILE"
python "scripts/history_atlas/$SCRIPT"

git config user.name  "history-atlas-bot"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add history-atlas/data
if ! git diff --cached --quiet; then
  git commit -m "History Atlas: ${LABEL} ($(date -u +%Y-%m-%d))"
  for i in 1 2 3; do
    if git pull --rebase --quiet; then
      git push --quiet && break
    else
      # another bot changed the same data files meanwhile (usually manifest.json): keep this run's version
      git checkout --theirs -- history-atlas/data 2>/dev/null || true
      git add history-atlas/data
      GIT_EDITOR=true git rebase --continue --quiet 2>/dev/null || git rebase --abort
    fi
    sleep 10
  done
fi

if [ -s "$ATLAS_ISSUE_FILE" ]; then
  {
    echo
    echo "_Opened automatically by the ${LABEL} bot ([run](${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-}/actions/runs/${GITHUB_RUN_ID:-})). Close when handled. How to act on it: history-atlas/BOTS.md._"
  } >> "$ATLAS_ISSUE_FILE"
  TITLE="History Atlas: ${LABEL} — $(date -u +%Y-%m-%d)"
  gh label create history-atlas --color 8E2F2A --description "Nigeria History Atlas bots and suggestions" 2>/dev/null || true
  gh issue create --title "$TITLE" --body-file "$ATLAS_ISSUE_FILE" --label history-atlas \
    || gh issue create --title "$TITLE" --body-file "$ATLAS_ISSUE_FILE"
fi
