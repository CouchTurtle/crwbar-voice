#!/usr/bin/env bash
# verify.sh — das eine Kommando, das vor jedem Push bestehen muss.
#
# Vertrag:
#   Exit 0 = alle Schritte gruen. Nur dann darf ein Haekchen gesetzt werden.
#   Exit 1 = mindestens ein Schritt rot. Die letzte Zeile nennt welche.
#   Die letzte Zeile ist die EVIDENZ-ZEILE: sie wird in Plan / PR gepastet,
#   nicht zusammengefasst. Eine Behauptung ist kein Beweis.
#
# Aufruf: bash scripts/verify.sh          (voll — der Standard)
#         bash scripts/verify.sh --quick  (ohne die langsamen Build-Schritte)
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

QUICK=0
[ "${1:-}" = "--quick" ] && QUICK=1

PASSED=(); FAILED=(); SKIPPED=()
step() {
  local name="$1"; shift
  printf '\n\033[1m▶ %s\033[0m\n' "$name"
  if "$@"; then PASSED+=("$name"); printf '\033[32m  ✓ %s\033[0m\n' "$name"
  else          FAILED+=("$name"); printf '\033[31m  ✗ %s\033[0m\n' "$name"; fi
}
skip() { SKIPPED+=("$1"); printf '\n\033[2m▷ %s (uebersprungen: %s)\033[0m\n' "$1" "$2"; }

step "typecheck" npx --no-install tsc --noEmit
step "lint" npx --no-install eslint src
step "format" npx --no-install prettier --check .
if command -v bun >/dev/null 2>&1; then step "uebersetzungen" bun scripts/check-translations.ts
else skip "uebersetzungen" "bun nicht installiert"; fi
if [ "$QUICK" = "1" ]; then skip "build" "--quick"; else step "build" npx --no-install vite build; fi

echo
echo "────────────────────────────────────────────────────────────"
JOIN() { local IFS=', '; echo "$*"; }
if [ ${#FAILED[@]} -eq 0 ]; then
  echo "VERIFY OK · crwbar-voice · $(date '+%Y-%m-%d %H:%M') · ${#PASSED[@]} gruen [$(JOIN "${PASSED[@]}")]${SKIPPED[*]:+ · uebersprungen: $(JOIN "${SKIPPED[@]}")}"
  exit 0
else
  echo "VERIFY FEHLGESCHLAGEN · crwbar-voice · $(date '+%Y-%m-%d %H:%M') · ${#FAILED[@]} rot [$(JOIN "${FAILED[@]}")] · ${#PASSED[@]} gruen"
  exit 1
fi
