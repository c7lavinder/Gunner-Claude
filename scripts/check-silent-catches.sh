#!/bin/bash
# check-silent-catches.sh
# Scans the repo for silent .catch() blocks that swallow errors without logging.
# Fix #3 swept 28 of these in one night. Catching new ones at PR time prevents regression.
# Run manually: bash scripts/check-silent-catches.sh
# Or wire into CI as a pre-merge check.
#
# POLICY: This script is the gate for NEW silent catches, not a backlog cleanup tool.
# The 79 historical instances in the broader codebase are tracked as P-items in PROGRESS.md
# and get cleaned up incrementally as files are touched for other reasons.
# NEW PRs that introduce silent catches must fix them before merge.
#
# To check only your changes against main:
#   git diff main --name-only -- '*.ts' '*.tsx' | xargs grep -nE "\.catch\(\(\)\s*=>\s*\{\s*\}\)" || true

set -e

echo "Scanning for silent catches..."

# Pattern 1: .catch(() => {})
# Pattern 2: .catch(() => null)
# Pattern 3: .catch(_ => {})
# Pattern 4: } catch {} (empty catch block)
matches=$(grep -rn -E "\.catch\(\(\)\s*=>\s*\{\s*\}\)|\.catch\(\(\)\s*=>\s*null\)|\.catch\(_\s*=>\s*\{\s*\}\)|\}\s*catch\s*\{\s*\}" \
  --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.claude \
  lib app scripts 2>/dev/null || true)

if [ -z "$matches" ]; then
  echo "✅ No silent catches found."
  exit 0
fi

count=$(echo "$matches" | wc -l | tr -d ' ')
echo "❌ Found $count silent catch(es). Each one is a debugging blind spot."
echo ""
echo "$matches"
echo ""
echo "Fix: replace with .catch(err => logFailure(tenantId, '<action_name>', '<resource>', err, { ...context }))"
echo "See lib/audit.ts for the helper. See Fix #3 commit (8b36af3) for examples."
exit 1
