#!/bin/bash
# scripts/pre-public-push-check.sh — run before any public-facing push
#
# Uses git grep (tracked files only) so the gate evaluates the SHIPPABLE state,
# not the local working tree. Untracked files and gitignored directories are
# automatically excluded.
set -e

# File pattern shared across most checks
PATHSPECS=("*.md" "*.json" "*.ts" "*.tsx" "*.js" "*.mjs" "*.cjs" "*.py" "*.rs" "*.toml" "*.yml" "*.yaml" "*.sh" "*.bash" "*.ps1" "*.bat" "*.nsh" "*.spec")
EXCLUDE_SELF=":(exclude)scripts/pre-public-push-check.sh"

echo "=== 1. Internal-paths and Claude-code automation ==="
if git grep -EnH "docs/research|docs/decisions|docs/bugs|\.claude/|\.context/|notebook_query|NotebookLM|claude -p|--dangerously-skip-permissions|\bMCP\b" -- "${PATHSPECS[@]}" "$EXCLUDE_SELF"; then
  echo "FAIL"
  exit 1
fi
echo "PASS"

echo "=== 2. Internal IDs in user-facing files (excludes tests) ==="
USER_FACING=("README.md" "SECURITY.md" "CHANGELOG.md" "LICENSE" "CONTRIBUTING.md" "package.json" "src-tauri/tauri.conf.json" "src-tauri/Cargo.toml")
if git grep -EnH "Phase [0-9]|Wave [0-9]|Session [0-9]+|BUG-[0-9]|DEC-[0-9]|KI-[0-9]|F-[0-9]+|QW-[0-9]+" -- "${USER_FACING[@]}" 2>/dev/null; then
  echo "FAIL"
  exit 1
fi
echo "PASS"

echo "=== 3. Personal identifiers + prior repo ==="
if git grep -EnH "notcryptic1001|kriptik10011|Weekly-Review-Program" -- "${PATHSPECS[@]}" "$EXCLUDE_SELF"; then
  echo "FAIL"
  exit 1
fi
echo "PASS"
# Note: 'crypt' substring excluded due to false positives (cryptography, sqlcipher3)
# Manual review of C:/Users/crypt path fragments still required

echo "=== 4. Placeholder URL leaks ==="
PLACEHOLDER_FILES=("README.md" "SECURITY.md" "CHANGELOG.md")
if git grep -EnH "anthropics/weekly-review|weekly-review-prod|YOUR_ORG" -- "${PLACEHOLDER_FILES[@]}" "src-tauri/" 2>/dev/null; then
  echo "FAIL"
  exit 1
fi
echo "PASS"

echo "=== 5. Personal data files must not exist ==="
if git ls-files | grep -E "^(inventory_audit_fields\.json|inventory_audit_raw\.json|ROADMAP\.md|BUILD\.md)$"; then
  echo "FAIL: personal data file is tracked"
  exit 1
fi
echo "PASS"

echo "=== 6. PyInstaller spec singleton ==="
SPEC_COUNT=$(git ls-files | grep -E '\.spec$' | wc -l)
if [ "$SPEC_COUNT" -gt 2 ]; then
  echo "FAIL: $SPEC_COUNT .spec files tracked (expected <=2)"
  exit 1
fi
echo "PASS"

echo "=== 7. Commit history check ==="
# Check only HEAD's history (the branch being pushed), not --all refs.
# Local dev branches like refactor/backend-architecture are preserved for rollback
# but never pushed; including them with --all produces false failures.
if git log HEAD --pretty=format:'%h %s%n%b' | grep -Ei "(BUG-|DEC-|KI-|Phase [0-9]|Wave [0-9]|Session [0-9]|kriptik|notcryptic)"; then
  echo "FAIL: internal refs in commit messages on HEAD"
  exit 1
fi
echo "PASS"

echo "=== 8. Author identity check ==="
# Check only HEAD's author metadata, not --all refs. Same rationale as check 7.
if git log HEAD --format='%ae' | sort -u | grep -iE "(notcryptic1001)"; then
  echo "FAIL: personal email in author metadata on HEAD"
  exit 1
fi
echo "PASS"

echo "=== 9. Threat-model leakage in source comments ==="
if git grep -EnH "brute-force|NIST|OWASP|Argon2id minimum|stolen-device" -- "backend/app/" "$EXCLUDE_SELF"; then
  echo "FAIL"
  exit 1
fi
echo "PASS"

echo ""
echo "All pre-push checks passed."
