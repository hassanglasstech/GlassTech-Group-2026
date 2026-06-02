#!/bin/bash
# Apply Supabase migration
# This script reads the migration SQL and sends it to Supabase

MIGRATION_FILE="${1:-.supabase/migrations/20260429_comprehensive_schema_fixes.sql}"
SUPABASE_URL="${VITE_SUPABASE_URL}"
SUPABASE_KEY="${VITE_SUPABASE_ANON_KEY}"

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ]; then
  echo "ERROR: Missing Supabase credentials in .env"
  echo "Expected: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY"
  exit 1
fi

echo "Migration file: $MIGRATION_FILE"
echo "Supabase project: $SUPABASE_URL"
echo ""
echo "To apply this migration manually:"
echo "1. Go to: ${SUPABASE_URL}/project/*/sql/new"
echo "2. Paste the SQL from: $MIGRATION_FILE"
echo "3. Click 'Run'"
echo ""
echo "Or use Supabase CLI:"
echo "  supabase db push"

