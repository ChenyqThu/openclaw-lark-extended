#!/usr/bin/env bash
# scripts/drift-check.sh — compare deployed runtime against the fork's lucien/main.
#
# Reports any file that differs between the fork repo and the live runtime
# directory. Useful as a daily cron probe — silent if everything matches,
# noisy if some hand edit drifted in.
#
# Usage:
#   bash scripts/drift-check.sh             # default fork → live diff
#   bash scripts/drift-check.sh --staging   # diff fork → staging instead

set -uo pipefail

FORK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="$HOME/.openclaw/extensions/openclaw-lark"
for arg in "$@"; do
  case "$arg" in
    --staging) TARGET="$HOME/.openclaw/extensions/openclaw-lark-next" ;;
    -h|--help) sed -n '2,12p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

if [[ ! -d "$TARGET" ]]; then
  echo "✗ target not found: $TARGET" >&2
  exit 1
fi

# Exclusions cover dev-only artifacts (scripts/, test/, examples/, docs/),
# runtime metadata that the gateway itself writes (.omc/), and top-level
# Markdown docs which are not runtime-relevant. The exclusion set must stay
# in sync with deploy.sh so that "deploy then drift-check" is reliably clean.
diff -qr \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='scripts' \
  --exclude='test' \
  --exclude='examples' \
  --exclude='docs' \
  --exclude='.omc' \
  --exclude='*.md' \
  --exclude='HANDOFF-*' \
  --exclude='pnpm-lock.yaml' \
  "$FORK/" "$TARGET/" \
  2>/dev/null > /tmp/drift-check-$$.out
rc=$?

if [[ $rc -eq 0 && ! -s /tmp/drift-check-$$.out ]]; then
  echo "✓ no drift: $TARGET matches fork lucien/main"
  rm -f /tmp/drift-check-$$.out
  exit 0
fi

echo "⚠ drift detected between $FORK and $TARGET:"
cat /tmp/drift-check-$$.out
rm -f /tmp/drift-check-$$.out
exit 1
