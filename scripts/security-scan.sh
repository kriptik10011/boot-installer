#!/usr/bin/env bash
# Security scan — 10 automated checks
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0
FAIL=0

check() {
  local name="$1" result="$2"
  if [ "$result" = "PASS" ]; then
    echo "  [PASS] $name"; PASS=$((PASS + 1))
  else
    echo "  [FAIL] $name"; FAIL=$((FAIL + 1))
  fi
}

echo "=== Security Scan ==="

# 1. Hardcoded secrets in src/backend
SECRETS=$(grep -rlE '(sk-[a-zA-Z0-9]{20,}|api_key\s*=\s*["\x27][A-Za-z0-9]+|password\s*=\s*["\x27][A-Za-z0-9]+)' "$ROOT/src" "$ROOT/backend/app" 2>/dev/null | grep -v node_modules | grep -v __pycache__ || true)
[ -z "$SECRETS" ] && check "No hardcoded secrets" "PASS" || check "No hardcoded secrets" "FAIL"

# 2. Raw SQL queries (SQL injection risk) — exclude DB infrastructure files
RAW_SQL=$(grep -rlE 'execute\s*\(\s*["\x27]SELECT|execute\s*\(\s*f["\x27]' "$ROOT/backend/app" 2>/dev/null | grep -v __pycache__ | grep -v 'database\.py' | grep -v 'migration\.py' | grep -v 'encrypted_database\.py' || true)
[ -z "$RAW_SQL" ] && check "No raw SQL queries" "PASS" || check "No raw SQL queries" "FAIL"

# 3. CSP configured in Tauri
if grep -q 'connect-src' "$ROOT/src-tauri/tauri.conf.json" 2>/dev/null; then
  check "CSP configured" "PASS"
else
  check "CSP configured" "FAIL"
fi

# 4. Backend localhost-only (should reject 0.0.0.0 binding)
if grep -qE 'host\s*=\s*["\x27]0\.0\.0\.0' "$ROOT/backend/app/main.py" 2>/dev/null; then
  check "Backend localhost-only" "FAIL"
else
  check "Backend localhost-only" "PASS"
fi

# 5. Pydantic validators in routers
VALIDATOR_COUNT=$(grep -rlE '(BaseModel|Field\(|validator|field_validator)' "$ROOT/backend/app/routers/" 2>/dev/null | wc -l)
[ "$VALIDATOR_COUNT" -gt 0 ] && check "Input validation present ($VALIDATOR_COUNT files)" "PASS" || check "Input validation present" "FAIL"

# 6. Debug endpoints gated
if grep -rl 'WEEKLY_REVIEW_DEV_MODE' "$ROOT/backend/app/" 2>/dev/null | grep -q .; then
  check "Debug endpoints gated" "PASS"
else
  check "Debug endpoints gated" "FAIL"
fi

# 7. Rate limiting present
if grep -rlE '(Limiter|slowapi|RateLim)' "$ROOT/backend/app/" 2>/dev/null | grep -q .; then
  check "Rate limiting present" "PASS"
else
  check "Rate limiting present" "FAIL"
fi

# 8. NPM no critical vulnerabilities
NPM_AUDIT=$(npm audit --audit-level=critical 2>/dev/null || true)
CRIT_COUNT=$(echo "$NPM_AUDIT" | grep -ciE 'critical' | tr -d '\r\n' || true)
if [ -z "$CRIT_COUNT" ] || [ "$CRIT_COUNT" = "0" ]; then
  check "NPM no critical vulns" "PASS"
else
  check "NPM no critical vulns" "FAIL"
fi

# 9. No dangerouslySetInnerHTML
DANGEROUS=$(grep -rl 'dangerouslySetInnerHTML' "$ROOT/src" 2>/dev/null | grep -v node_modules || true)
[ -z "$DANGEROUS" ] && check "No dangerouslySetInnerHTML" "PASS" || check "No dangerouslySetInnerHTML" "FAIL"

# 10. Error sanitization (no stack traces in error responses)
STACK_LEAK=$(grep -rlE '(traceback|stack.*trace|\.stack)' "$ROOT/backend/app/routers/" 2>/dev/null | grep -v __pycache__ || true)
[ -z "$STACK_LEAK" ] && check "Error sanitization" "PASS" || check "Error sanitization" "FAIL"

TOTAL=$((PASS + FAIL))
echo "=== $PASS/$TOTAL passed, $FAIL/$TOTAL failed ==="
if [ "$FAIL" -eq 0 ]; then exit 0; else exit 1; fi
