#!/bin/bash

# ============================================================
# GlassTech ERP — Schema Migration Setup Assistant
# ============================================================

set -e

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║  GlassTech ERP — Schema Migration Assistant            ║"
echo "║  Comprehensive Schema Fixes (20260429)                 ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Load environment
if [ -f .env ]; then
  set -a
  source .env
  set +a
  echo "✓ Loaded .env configuration"
else
  echo "✗ ERROR: .env file not found"
  echo "  Please ensure .env exists in the project root"
  exit 1
fi

# Check Supabase credentials
if [ -z "$VITE_SUPABASE_URL" ] || [ -z "$VITE_SUPABASE_ANON_KEY" ]; then
  echo "✗ ERROR: Missing Supabase credentials"
  echo "  Required: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY"
  exit 1
fi

echo "✓ Supabase credentials found"
echo "  Project: $VITE_SUPABASE_URL"
echo ""

# Check migration file
MIGRATION_FILE="supabase/migrations/20260429_comprehensive_schema_fixes.sql"
if [ ! -f "$MIGRATION_FILE" ]; then
  echo "✗ ERROR: Migration file not found: $MIGRATION_FILE"
  exit 1
fi

echo "✓ Migration file found: $MIGRATION_FILE"
echo ""

# Show options
echo "════════════════════════════════════════════════════════"
echo "HOW TO APPLY THIS MIGRATION:"
echo "════════════════════════════════════════════════════════"
echo ""
echo "Option 1: Web Console (Recommended)"
echo "---------"
echo "  1. Open: $VITE_SUPABASE_URL"
echo "  2. Go to: SQL Editor → New Query"
echo "  3. Copy and paste the SQL from:"
echo "     $MIGRATION_FILE"
echo "  4. Click 'Run'"
echo ""
echo ""
echo "Option 2: Using This Script"
echo "---------"
if command -v wc-copy &> /dev/null || command -v xclip &> /dev/null || command -v pbcopy &> /dev/null; then
  echo "  This script can copy the SQL to clipboard:"
  echo ""
  read -p "  Would you like to copy the migration SQL to clipboard? (y/n) " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    if command -v xclip &> /dev/null; then
      cat "$MIGRATION_FILE" | xclip -selection clipboard
      echo "  ✓ SQL copied to clipboard (xclip)"
    elif command -v pbcopy &> /dev/null; then
      cat "$MIGRATION_FILE" | pbcopy
      echo "  ✓ SQL copied to clipboard (pbcopy)"
    else
      echo "  Could not copy — paste manually instead"
    fi
  fi
else
  echo "  To copy the SQL to clipboard, run:"
  echo "  cat $MIGRATION_FILE | xclip -selection clipboard"
  echo ""
  echo "  Or view the SQL:"
  echo "  cat $MIGRATION_FILE"
fi
echo ""
echo ""
echo "════════════════════════════════════════════════════════"
echo ""
echo "After applying the migration in Supabase:"
echo "  1. Restart the dev server: npm run dev"
echo "  2. Test the app in browser: http://localhost:3000"
echo "  3. Check browser console (F12) for any remaining errors"
echo ""
