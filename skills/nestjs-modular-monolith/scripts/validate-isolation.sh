#!/bin/bash
#
# State Isolation Validator for Modular Monoliths
#
# Checks for common state isolation violations in a modular monolith codebase.
# Run from the project root. Can be used as a pre-commit hook, CI step, or manual check.
#
# Usage:
#   ./validate-isolation.sh [--strict]
#
# Flags:
#   --strict    Treat warnings as errors (recommended for CI)
#
# Exit codes:
#   0 - All checks passed
#   1 - One or more errors found

set -euo pipefail

STRICT=false
ERRORS=0
WARNINGS=0

if [[ "${1:-}" == "--strict" ]]; then
  STRICT=true
fi

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

error() {
  echo -e "${RED}❌ ERROR: $1${NC}"
  ERRORS=$((ERRORS + 1))
}

warn() {
  echo -e "${YELLOW}⚠️  WARNING: $1${NC}"
  WARNINGS=$((WARNINGS + 1))
}

pass() {
  echo -e "${GREEN}✅ $1${NC}"
}

echo "🔍 Modular Monolith — State Isolation Validator"
echo "================================================"
echo ""

# ─────────────────────────────────────────────────
# Check 1: Duplicate Prisma model names
# ─────────────────────────────────────────────────
echo "📋 Check 1: Duplicate Prisma model names"

if [ -d "prisma" ]; then
  DUPES=$(grep -r "^model " prisma/ 2>/dev/null | awk '{print $2}' | sort | uniq -d || true)
  if [ -n "$DUPES" ]; then
    error "Duplicate model names found: $DUPES"
    echo "   Fix: Prefix each model with its module name (e.g., BillingPlan, IdentityUser)"
  else
    pass "No duplicate model names"
  fi
else
  echo "   Skipped — no prisma/ directory found"
fi

echo ""

# ─────────────────────────────────────────────────
# Check 2: Duplicate table mappings (@@map)
# ─────────────────────────────────────────────────
echo "📋 Check 2: Duplicate table mappings"

if [ -d "prisma" ]; then
  MAP_DUPES=$(grep -r '@@map(' prisma/ 2>/dev/null | grep -o '"[^"]*"' | sort | uniq -d || true)
  if [ -n "$MAP_DUPES" ]; then
    error "Duplicate @@map values found: $MAP_DUPES"
  else
    pass "No duplicate table mappings"
  fi
else
  echo "   Skipped — no prisma/ directory found"
fi

echo ""

# ─────────────────────────────────────────────────
# Check 3: Direct cross-module imports (non-barrel)
# ─────────────────────────────────────────────────
echo "📋 Check 3: Direct cross-module imports"

if [ -d "libs" ]; then
  CROSS_IMPORTS=$(grep -rn "from '@project/" libs/ 2>/dev/null | grep -v "/index" | grep -v "shared" | grep -v node_modules | grep -v ".spec." | grep -v ".test." || true)
  if [ -n "$CROSS_IMPORTS" ]; then
    warn "Direct cross-module imports detected (should use barrel exports):"
    echo "$CROSS_IMPORTS" | head -10
    echo "   Fix: Import only from module barrel (@project/module-name)"
  else
    pass "No direct cross-module imports"
  fi
else
  echo "   Skipped — no libs/ directory found"
fi

echo ""

# ─────────────────────────────────────────────────
# Check 4: Shared mutable state (exported singletons)
# ─────────────────────────────────────────────────
echo "📋 Check 4: Shared mutable state"

if [ -d "libs" ]; then
  SHARED_STATE=$(grep -rn "export.*=.*new" libs/ 2>/dev/null | grep -v test | grep -v node_modules | grep -v ".spec." | grep -v ".test." || true)
  if [ -n "$SHARED_STATE" ]; then
    warn "Exported mutable singletons found (should use DI instead):"
    echo "$SHARED_STATE" | head -10
  else
    pass "No shared mutable state"
  fi
else
  echo "   Skipped — no libs/ directory found"
fi

echo ""

# ─────────────────────────────────────────────────
# Check 5: Synchronous cross-module service calls
# ─────────────────────────────────────────────────
echo "📋 Check 5: Cross-module synchronous calls"

if [ -d "libs" ]; then
  SYNC_CALLS=$(grep -rn "await.*Service\." libs/ 2>/dev/null | grep -v "this\." | grep -v test | grep -v node_modules | grep -v ".spec." | grep -v ".test." || true)
  if [ -n "$SYNC_CALLS" ]; then
    warn "Possible synchronous cross-module calls detected (consider using events):"
    echo "$SYNC_CALLS" | head -10
  else
    pass "No synchronous cross-module calls"
  fi
else
  echo "   Skipped — no libs/ directory found"
fi

echo ""

# ─────────────────────────────────────────────────
# Check 6: Generic entity names without module prefix
# ─────────────────────────────────────────────────
echo "📋 Check 6: Generic entity names"

if [ -d "libs" ]; then
  GENERIC_ENTITIES=$(grep -rn "^export class \(User\|Plan\|Item\|Profile\|Order\|Product\|Account\|Session\) " libs/ 2>/dev/null | grep -v "Error\|Exception\|Event\|Command\|Query\|Handler\|Dto\|Module\|Guard\|Filter\|test\|spec" || true)
  if [ -n "$GENERIC_ENTITIES" ]; then
    warn "Generic entity names found (should use module prefix):"
    echo "$GENERIC_ENTITIES" | head -10
    echo "   Fix: Use module-prefixed names like IdentityUser, BillingPlan, OrderItem"
  else
    pass "No generic entity names"
  fi
else
  echo "   Skipped — no libs/ directory found"
fi

echo ""

# ─────────────────────────────────────────────────
# Check 7: Cross-module @relation in Prisma
# ─────────────────────────────────────────────────
echo "📋 Check 7: Cross-module Prisma relations"

if [ -d "prisma" ]; then
  # This is a heuristic — flag all @relation for manual review
  RELATIONS=$(grep -n '@relation' prisma/schema.prisma 2>/dev/null || true)
  if [ -n "$RELATIONS" ]; then
    echo "   ℹ️  Found @relation declarations — verify these are WITHIN a single module:"
    echo "$RELATIONS" | head -10
    echo "   Cross-module references should use plain ID fields, not @relation"
  else
    pass "No @relation declarations to review"
  fi
else
  echo "   Skipped — no prisma/ directory found"
fi

echo ""

# ─────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────
echo "================================================"

if [ $ERRORS -gt 0 ]; then
  echo -e "${RED}❌ Failed: $ERRORS error(s), $WARNINGS warning(s)${NC}"
  exit 1
elif [ $WARNINGS -gt 0 ] && [ "$STRICT" = true ]; then
  echo -e "${YELLOW}❌ Failed (strict mode): $WARNINGS warning(s) treated as errors${NC}"
  exit 1
elif [ $WARNINGS -gt 0 ]; then
  echo -e "${YELLOW}⚠️  Passed with $WARNINGS warning(s)${NC}"
  exit 0
else
  echo -e "${GREEN}✅ All checks passed!${NC}"
  exit 0
fi
