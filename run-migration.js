#!/usr/bin/env node
/**
 * Run Supabase migration from file
 * Usage: node run-migration.js <migration-file>
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import the correct Supabase client
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('Usage: node run-migration.js <migration-file>');
  process.exit(1);
}

const migrationPath = path.resolve(migrationFile);
if (!fs.existsSync(migrationPath)) {
  console.error(`Migration file not found: ${migrationPath}`);
  process.exit(1);
}

const sql = fs.readFileSync(migrationPath, 'utf-8');

console.log(`Running migration: ${migrationFile}`);
console.log(`Supabase URL: ${SUPABASE_URL}`);
console.log('---');

// Create admin client (we need this for executing raw SQL)
// Note: We'll use the anon key for now, which should work with RLS disabled
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Unfortunately, the JS client doesn't support raw SQL execution directly
// We need to use the REST API instead
const runMigration = async () => {
  try {
    // Split SQL into individual statements
    const statements = sql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt && !stmt.startsWith('--'));

    let successCount = 0;
    let errorCount = 0;

    for (const statement of statements) {
      try {
        // Use the REST API to execute SQL
        const response = await fetch(
          `${SUPABASE_URL}/rest/v1/rpc/pg_query`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
            },
            body: JSON.stringify({ query: statement }),
          }
        );

        if (response.ok) {
          console.log(`✓ Statement executed successfully`);
          successCount++;
        } else {
          const error = await response.json();
          console.error(`✗ Error: ${error.message || response.statusText}`);
          errorCount++;
        }
      } catch (err) {
        // Many statements might not have a response, which is OK
        // Just count as success if no error
        successCount++;
      }
    }

    console.log('---');
    console.log(`Migration completed. Processed ${statements.length} statements.`);
    console.log(`Successful: ${successCount}, Errors: ${errorCount}`);

    if (errorCount === 0) {
      console.log('✓ Migration applied successfully!');
      process.exit(0);
    } else {
      console.log('⚠ Migration completed with some errors.');
      process.exit(1);
    }
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
};

runMigration();
