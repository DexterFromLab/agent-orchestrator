#!/usr/bin/env bash
# BTerminal — unified test runner
# Usage: ./scripts/test-all.sh [--e2e] [--verbose]
#
# Runs vitest (frontend) + cargo test (backend) by default.
# Pass --e2e to also run WebDriverIO E2E tests (requires built binary).

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

V2_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUN_E2E=false
VERBOSE=false
FAILED=()

for arg in "$@"; do
  case "$arg" in
    --e2e) RUN_E2E=true ;;
    --verbose|-v) VERBOSE=true ;;
    --help|-h)
      echo "Usage: $0 [--e2e] [--verbose]"
      echo "  --e2e      Also run WebDriverIO E2E tests (requires built binary)"
      echo "  --verbose  Show full test output instead of summary"
      exit 0
      ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

step() {
  echo -e "\n${CYAN}${BOLD}━━━ $1 ━━━${RESET}"
}

pass() {
  echo -e "${GREEN}✓ $1${RESET}"
}

fail() {
  echo -e "${RED}✗ $1${RESET}"
  FAILED+=("$1")
}

# --- Vitest (frontend) ---
step "Vitest (frontend unit tests)"
if $VERBOSE; then
  (cd "$V2_DIR" && npm run test) && pass "Vitest" || fail "Vitest"
else
  if OUTPUT=$(cd "$V2_DIR" && npm run test 2>&1); then
    SUMMARY=$(echo "$OUTPUT" | grep -E "Tests|Test Files" | tail -2)
    echo "$SUMMARY"
    pass "Vitest"
  else
    echo "$OUTPUT" | tail -20
    fail "Vitest"
  fi
fi

# --- Cargo test (backend) ---
step "Cargo test (Rust backend)"
if $VERBOSE; then
  (cd "$V2_DIR/src-tauri" && cargo test) && pass "Cargo test" || fail "Cargo test"
else
  if OUTPUT=$(cd "$V2_DIR/src-tauri" && cargo test 2>&1); then
    SUMMARY=$(echo "$OUTPUT" | grep -E "test result:|running" | head -5)
    echo "$SUMMARY"
    pass "Cargo test"
  else
    echo "$OUTPUT" | tail -20
    fail "Cargo test"
  fi
fi

# --- E2E (WebDriverIO) ---
if $RUN_E2E; then
  step "E2E tests (WebDriverIO + tauri-driver)"

  # Check for built binary
  BINARY=$(find "$V2_DIR/src-tauri/target" -name "bterminal*" -type f -executable -path "*/release/*" 2>/dev/null | head -1)
  if [ -z "$BINARY" ]; then
    echo -e "${YELLOW}⚠ No release binary found. Run 'npm run tauri build' first.${RESET}"
    fail "E2E (no binary)"
  else
    if $VERBOSE; then
      (cd "$V2_DIR" && npm run test:e2e) && pass "E2E" || fail "E2E"
    else
      if OUTPUT=$(cd "$V2_DIR" && npm run test:e2e 2>&1); then
        SUMMARY=$(echo "$OUTPUT" | grep -E "passing|failing|skipped" | tail -3)
        echo "$SUMMARY"
        pass "E2E"
      else
        echo "$OUTPUT" | tail -30
        fail "E2E"
      fi
    fi
  fi
else
  echo -e "\n${YELLOW}Skipping E2E tests (pass --e2e to include)${RESET}"
fi

# --- Summary ---
echo -e "\n${BOLD}━━━ Summary ━━━${RESET}"
if [ ${#FAILED[@]} -eq 0 ]; then
  echo -e "${GREEN}${BOLD}All test suites passed.${RESET}"
  exit 0
else
  echo -e "${RED}${BOLD}Failed suites: ${FAILED[*]}${RESET}"
  exit 1
fi
