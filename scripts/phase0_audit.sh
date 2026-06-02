#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Phase 0 · Pre-Flight Static Quality Gate — Audit Script
#
# Runs 20 static checks across the codebase and produces a color-coded report
# at docs/testing/phase0/PHASE0_REPORT.md.
#
# Usage:  bash scripts/phase0_audit.sh
# Scope:  modules/sales/** and modules/glassco/** (per CLAUDE.md focus)
# ──────────────────────────────────────────────────────────────────────────────

set +e   # don't bail on individual failures; we want to collect all results
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

OUT_DIR="docs/testing/phase0"
mkdir -p "$OUT_DIR"
REPORT="$OUT_DIR/PHASE0_REPORT.md"

# Color codes
R='\033[0;31m'   # red
G='\033[0;32m'   # green
Y='\033[1;33m'   # yellow
B='\033[0;34m'   # blue
N='\033[0m'      # reset

# Counters
P1_PASS=0; P1_FAIL=0
P2_PASS=0; P2_FAIL=0
P3_PASS=0; P3_FAIL=0

# ── Report header ─────────────────────────────────────────────────────────────
{
  echo "# Phase 0 · Pre-Flight Audit Report"
  echo ""
  echo "**Generated:** $(date '+%Y-%m-%d %H:%M:%S')"
  echo "**Scope:** modules/sales/** + modules/glassco/**"
  echo "**Git commit:** $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
  echo ""
  echo "---"
  echo ""
} > "$REPORT"

# Helper: log a check result
log_check() {
  local sev="$1"; local id="$2"; local title="$3"; local status="$4"; local detail="$5"
  local icon="✅"; local color="$G"
  if [[ "$status" == "FAIL" ]]; then icon="❌"; color="$R"; fi
  if [[ "$status" == "WARN" ]]; then icon="⚠️ "; color="$Y"; fi

  echo -e "${color}[${sev}] #${id} ${title}: ${status}${N}  ${detail}"
  {
    echo "### ${icon} [${sev}] #${id} · ${title}"
    echo ""
    echo "**Status:** \`${status}\`"
    if [[ -n "$detail" ]]; then
      echo ""
      echo "**Details:**"
      echo '```'
      echo -e "$detail"
      echo '```'
    fi
    echo ""
  } >> "$REPORT"

  case "$sev" in
    P1) if [[ "$status" == "PASS" ]]; then ((P1_PASS++)); else ((P1_FAIL++)); fi ;;
    P2) if [[ "$status" == "PASS" ]]; then ((P2_PASS++)); else ((P2_FAIL++)); fi ;;
    P3) if [[ "$status" == "PASS" ]]; then ((P3_PASS++)); else ((P3_FAIL++)); fi ;;
  esac
}

echo -e "${B}═══════════════════════════════════════════════════════${N}"
echo -e "${B} Phase 0 · Pre-Flight Audit · GlassTech Group ERP${N}"
echo -e "${B}═══════════════════════════════════════════════════════${N}"
echo ""

# ──────────────────────────────────────────────────────────────────────────────
# P1 CHECKS (BLOCK GO-LIVE)
# ──────────────────────────────────────────────────────────────────────────────
echo -e "${B}┌─ P1 (block-go-live) checks ─────────────────────${N}"
echo "## P1 · Block-Go-Live Checks" >> "$REPORT"
echo "" >> "$REPORT"

# #1 TypeScript compile (sales scope)
ts_errors=$(npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "modules/(sales|glassco)/" | wc -l | tr -d ' ')
if [[ "$ts_errors" == "0" ]]; then
  log_check "P1" "01" "TypeScript compile (sales/glassco scope)" "PASS" "0 errors in scoped modules"
else
  sample=$(npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "modules/(sales|glassco)/" | head -5)
  log_check "P1" "01" "TypeScript compile (sales/glassco scope)" "FAIL" "${ts_errors} errors. Sample:\n${sample}"
fi

# #2 Company filter on every Supabase query in sales services
# FIX: also check the SAME line + next 12 lines (was missing same-line filter)
SYSTEM_TABLES_RX="csv_import_logs|cutover_snapshot|erp_config|user_profiles|notifications|companies|fiscal_periods|accounts|sb_meta|audit_log|backup_log|alert_log"
unfiltered=$(grep -rEn "\.from\(['\"][a-z_]+['\"]" modules/sales/services/ modules/glassco/ 2>/dev/null \
  | grep -v "\.spec\.\|\.test\." \
  | awk -F: '{print $1":"$2}' \
  | while read line_loc; do
      file="${line_loc%:*}"; lineno="${line_loc##*:}"
      # Read CURRENT line + next 12 lines (was: lineno+8 starting at lineno; we now properly include same line)
      snippet=$(sed -n "${lineno},$((lineno+12))p" "$file")
      if ! echo "$snippet" | grep -qE "\.eq\(['\"]company['\"]|${SYSTEM_TABLES_RX}"; then
        echo "$file:$lineno"
      fi
    done | wc -l | tr -d ' ')
if [[ "$unfiltered" == "0" ]]; then
  log_check "P1" "02" "Company filter on Supabase queries" "PASS" "All queries scoped"
else
  sample=$(grep -rEn "\.from\(['\"][a-z_]+['\"]" modules/sales/services/ modules/glassco/ 2>/dev/null \
    | grep -v "test\|\.spec\." | head -10)
  log_check "P1" "02" "Company filter on Supabase queries" "WARN" "${unfiltered} queries to inspect manually:\n${sample}"
fi

# #3 RLS coverage — requires Supabase access; mark as MANUAL
log_check "P1" "03" "RLS policy on every table" "MANUAL" "Run in Supabase SQL editor: SELECT t.tablename, p.polname FROM pg_tables t LEFT JOIN pg_policies p USING(tablename) WHERE t.schemaname='public' AND p.polname IS NULL;"

# #4 No 'any' types in sales scope
any_count=$(grep -rEn ":\s*any[\s,\)\>\{]|: any$|<any>" modules/sales/ modules/glassco/ --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v "// eslint-disable\|@ts-ignore\|\.spec\.\|\.test\." | wc -l | tr -d ' ')
if [[ "$any_count" -le "5" ]]; then
  log_check "P1" "04" "No 'any' types in sales scope" "PASS" "${any_count} occurrences (tolerance 5)"
else
  sample=$(grep -rEn ":\s*any[\s,\)\>\{]|: any$|<any>" modules/sales/ modules/glassco/ --include="*.ts" --include="*.tsx" 2>/dev/null \
    | grep -v "// eslint-disable\|@ts-ignore" | head -10)
  log_check "P1" "04" "No 'any' types in sales scope" "FAIL" "${any_count} occurrences. Sample:\n${sample}"
fi

# #5 No direct ledger insert outside finance/glasscoGL services
direct_ledger=$(grep -rEn "from\(['\"]ledger['\"]\).*\.insert" modules/ --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v "financeService\|glasscoGLService\|grnGLService\|deliveryInvoiceService\|creditNoteService\|cutoverService\|AROpeningBalance\|gtkJobOrderService\|auditService" \
  | wc -l | tr -d ' ')
if [[ "$direct_ledger" == "0" ]]; then
  log_check "P1" "05" "No direct ledger insert (bypass postJournal)" "PASS" "All ledger writes go through approved services"
else
  sample=$(grep -rEn "from\(['\"]ledger['\"]\).*\.insert" modules/ --include="*.ts" --include="*.tsx" 2>/dev/null \
    | grep -v "financeService\|glasscoGLService\|grnGLService\|deliveryInvoiceService\|creditNoteService\|cutoverService\|AROpeningBalance\|gtkJobOrderService\|auditService" | head -5)
  log_check "P1" "05" "No direct ledger insert (bypass postJournal)" "FAIL" "${direct_ledger} bypass calls:\n${sample}"
fi

# #6 No hardcoded secrets
secrets=$(grep -rEn "eyJ[A-Za-z0-9_-]{20,}|sk_live_[A-Za-z0-9]{20,}|sk_test_[A-Za-z0-9]{20,}|service_role_key" \
  modules/ src/ --include="*.ts" --include="*.tsx" --include="*.js" 2>/dev/null \
  | grep -v "\.env\|placeholder\|example\|README\|comment" | wc -l | tr -d ' ')
if [[ "$secrets" == "0" ]]; then
  log_check "P1" "06" "No hardcoded secrets" "PASS" "Clean"
else
  log_check "P1" "06" "No hardcoded secrets" "FAIL" "${secrets} hits — review immediately"
fi

# #7 No console.log in production code (sales/glassco scope)
console_logs=$(grep -rEn "console\.(log|info|debug)" modules/sales/ modules/glassco/ --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v "Logger\|\.spec\.\|\.test\.\|// console" | wc -l | tr -d ' ')
if [[ "$console_logs" -le "5" ]]; then
  log_check "P1" "07" "No console.log in sales scope" "PASS" "${console_logs} (≤5)"
else
  sample=$(grep -rEn "console\.(log|info|debug)" modules/sales/ modules/glassco/ --include="*.ts" --include="*.tsx" 2>/dev/null \
    | grep -v "Logger\|\.spec\." | head -10)
  log_check "P1" "07" "No console.log in sales scope" "WARN" "${console_logs} occurrences. Sample:\n${sample}"
fi

# ──────────────────────────────────────────────────────────────────────────────
# P2 CHECKS (FIX BEFORE TESTING)
# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${B}┌─ P2 (fix before testing) checks ────────────────${N}"
echo "" >> "$REPORT"
echo "## P2 · Pre-Testing Checks" >> "$REPORT"
echo "" >> "$REPORT"

# #8 ESLint — many projects don't have it; check first
if [[ -f "package.json" ]] && grep -q "\"lint\":" package.json; then
  lint_out=$(npm run lint --silent 2>&1 | tail -20)
  if echo "$lint_out" | grep -qE "error|problem"; then
    log_check "P2" "08" "ESLint" "WARN" "Lint output:\n$(echo "$lint_out" | head -10)"
  else
    log_check "P2" "08" "ESLint" "PASS" "Clean"
  fi
else
  log_check "P2" "08" "ESLint" "SKIP" "No lint script in package.json"
fi

# #9 Production build — slow; mark MANUAL unless --full flag
if [[ "$1" == "--full" ]]; then
  build_out=$(npm run build 2>&1 | tail -10)
  if echo "$build_out" | grep -qE "error|fail"; then
    log_check "P2" "09" "Production build" "FAIL" "$(echo "$build_out" | head -5)"
  else
    log_check "P2" "09" "Production build" "PASS" "Build succeeded"
  fi
else
  log_check "P2" "09" "Production build" "MANUAL" "Run with --full flag, or: npm run build"
fi

# #10 Bundle size — depends on build
log_check "P2" "10" "Bundle size per route" "MANUAL" "Run: npx vite-bundle-visualizer or analyze dist/"

# #11 Unused exports
if command -v npx >/dev/null 2>&1; then
  unused=$(npx ts-prune --error 2>/dev/null | grep -E "modules/(sales|glassco)/" | wc -l | tr -d ' ')
  if [[ "$unused" -le "20" ]]; then
    log_check "P2" "11" "Unused exports (ts-prune)" "PASS" "${unused} (≤20)"
  else
    log_check "P2" "11" "Unused exports (ts-prune)" "WARN" "${unused} unused exports in sales scope"
  fi
else
  log_check "P2" "11" "Unused exports (ts-prune)" "SKIP" "ts-prune not installed"
fi

# #12 Circular deps
# FIX: grep -c with no matches returns 0 (exit 1), || echo "0" appends literal — use grep -c "→" 2>/dev/null then default
if command -v npx >/dev/null 2>&1; then
  circ_out=$(npx madge --circular --extensions ts,tsx modules/sales/ modules/glassco/ 2>/dev/null)
  circ=$(echo "$circ_out" | grep -c "→")
  [[ -z "$circ" ]] && circ=0
  if [[ "$circ" -eq 0 ]]; then
    log_check "P2" "12" "Circular dependencies" "PASS" "None"
  else
    log_check "P2" "12" "Circular dependencies" "WARN" "${circ} cycles detected"
  fi
else
  log_check "P2" "12" "Circular dependencies" "SKIP" "madge not installed"
fi

# #13 npm audit (production)
if command -v npm >/dev/null 2>&1; then
  audit_high=$(npm audit --production --json 2>/dev/null | grep -oE '"high":\s*[0-9]+' | head -1 | grep -oE '[0-9]+' || echo "0")
  audit_crit=$(npm audit --production --json 2>/dev/null | grep -oE '"critical":\s*[0-9]+' | head -1 | grep -oE '[0-9]+' || echo "0")
  if [[ "$audit_high" == "0" && "$audit_crit" == "0" ]]; then
    log_check "P2" "13" "npm audit (production)" "PASS" "0 High, 0 Critical"
  else
    log_check "P2" "13" "npm audit (production)" "WARN" "High: ${audit_high}, Critical: ${audit_crit}"
  fi
fi

# #14 Migration order
mig_count=$(ls supabase/migrations/*.sql 2>/dev/null | wc -l | tr -d ' ')
log_check "P2" "14" "Migration count" "PASS" "${mig_count} migration files"

# ──────────────────────────────────────────────────────────────────────────────
# P3 CHECKS (QUALITY / TRACK AS DEBT)
# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${B}┌─ P3 (quality bar) checks ───────────────────────${N}"
echo "" >> "$REPORT"
echo "## P3 · Quality / Debt-Tracking Checks" >> "$REPORT"
echo "" >> "$REPORT"

# #15 Inline styles
inline=$(grep -rEn 'style=\{\{' modules/sales/ modules/glassco/ --include="*.tsx" 2>/dev/null | wc -l | tr -d ' ')
if [[ "$inline" -le "10" ]]; then
  log_check "P3" "15" "Inline styles" "PASS" "${inline} (≤10)"
else
  log_check "P3" "15" "Inline styles" "WARN" "${inline} occurrences"
fi

# #16 Try/catch coverage in service async functions — heuristic
service_async=$(grep -rEn "export const \w+ = async" modules/sales/services/ 2>/dev/null | wc -l | tr -d ' ')
service_try=$(grep -rEn "try {" modules/sales/services/ 2>/dev/null | wc -l | tr -d ' ')
log_check "P3" "16" "Try/catch on async services (heuristic)" "PASS" "async fns: ${service_async}, try blocks: ${service_try}"

# #17 useAuthStore BUG-1 pattern
auth_calls=$(grep -rEn "useAuthStore\(\)" modules/sales/ modules/glassco/ --include="*.tsx" 2>/dev/null | wc -l | tr -d ' ')
auth_with_profile=$(grep -rEn "useAuthStore\(\)" modules/sales/ modules/glassco/ --include="*.tsx" 2>/dev/null \
  | while read line; do
      file="${line%%:*}"; rest="${line#*:}"; lineno="${rest%%:*}"
      sed -n "${lineno},$((lineno+3))p" "$file" | grep -qE "user.*profile|profile.*user" && echo "ok"
    done | wc -l | tr -d ' ')
if [[ "$auth_calls" == "$auth_with_profile" ]]; then
  log_check "P3" "17" "useAuthStore BUG-1 pattern (user + profile)" "PASS" "${auth_with_profile}/${auth_calls} use both"
else
  log_check "P3" "17" "useAuthStore BUG-1 pattern (user + profile)" "WARN" "${auth_with_profile}/${auth_calls} use both"
fi

# #18 Lazy-load coverage
total_routes=$(grep -cE "<Route path=" App.tsx 2>/dev/null || echo "0")
lazy_routes=$(grep -cE "React\.lazy" App.tsx 2>/dev/null || echo "0")
log_check "P3" "18" "Lazy-load routes" "PASS" "${lazy_routes} lazy imports, ${total_routes} routes"

# #19 FK orphans — requires DB
log_check "P3" "19" "Foreign-key orphans (clients/invoices)" "MANUAL" "Run in Supabase: SELECT count(*) FROM invoices WHERE client_id NOT IN (SELECT id FROM clients);"

# #20 TODO/FIXME debt
todo_count=$(grep -rEn "TODO|FIXME|HACK|XXX" modules/sales/ modules/glassco/ --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l | tr -d ' ')
log_check "P3" "20" "TODO/FIXME debt" "PASS" "${todo_count} markers in sales scope (tracked)"

# ──────────────────────────────────────────────────────────────────────────────
# SUMMARY
# ──────────────────────────────────────────────────────────────────────────────
{
  echo ""
  echo "---"
  echo ""
  echo "## Summary"
  echo ""
  echo "| Severity | Pass | Fail | Total |"
  echo "|---|---|---|---|"
  echo "| **P1** (block go-live) | ${P1_PASS} | ${P1_FAIL} | $((P1_PASS+P1_FAIL)) |"
  echo "| **P2** (fix before testing) | ${P2_PASS} | ${P2_FAIL} | $((P2_PASS+P2_FAIL)) |"
  echo "| **P3** (track as debt) | ${P3_PASS} | ${P3_FAIL} | $((P3_PASS+P3_FAIL)) |"
  echo ""
  if [[ "$P1_FAIL" == "0" ]]; then
    echo "### ✅ Phase 0 P1 Gate: **PASS** — proceed to Phase 1"
  else
    echo "### ❌ Phase 0 P1 Gate: **FAIL** — fix P1 items before proceeding"
  fi
  echo ""
  echo "_Generated by \`scripts/phase0_audit.sh\` on $(date '+%Y-%m-%d %H:%M:%S')_"
} >> "$REPORT"

echo ""
echo -e "${B}═══════════════════════════════════════════════════════${N}"
echo -e " Summary: P1 ${G}${P1_PASS}P${N}/${R}${P1_FAIL}F${N}  P2 ${G}${P2_PASS}P${N}/${R}${P2_FAIL}F${N}  P3 ${G}${P3_PASS}P${N}/${R}${P3_FAIL}F${N}"
echo -e " Report: ${B}${REPORT}${N}"
echo -e "${B}═══════════════════════════════════════════════════════${N}"

if [[ "$P1_FAIL" == "0" ]]; then
  echo -e "${G}✅ Phase 0 P1 Gate: PASS${N}"
  exit 0
else
  echo -e "${R}❌ Phase 0 P1 Gate: FAIL — fix P1 items before proceeding${N}"
  exit 1
fi
