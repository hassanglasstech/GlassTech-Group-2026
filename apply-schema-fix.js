#!/usr/bin/env node
/**
 * Apply Supabase schema migration
 * Reads migration SQL and executes against Supabase
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Try to import createClient from @supabase/supabase-js
let createClient;
try {
  const supabaseModule = require('@supabase/supabase-js');
  createClient = supabaseModule.createClient;
} catch (e) {
  console.error('ERROR: @supabase/supabase-js not found');
  console.error('Run: npm install @supabase/supabase-js');
  process.exit(1);
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('ERROR: Missing Supabase credentials in .env');
  console.error('Required: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const migrationFile = path.join(__dirname, 'supabase', 'migrations', '20260429_comprehensive_schema_fixes.sql');

if (!fs.existsSync(migrationFile)) {
  console.error(`ERROR: Migration file not found: ${migrationFile}`);
  process.exit(1);
}

const sql = fs.readFileSync(migrationFile, 'utf-8');

console.log('═══════════════════════════════════════════════════════');
console.log('  Supabase Schema Migration — Comprehensive Fixes');
console.log('═══════════════════════════════════════════════════════');
console.log(`Migration file: ${migrationFile}`);
console.log(`Supabase URL: ${SUPABASE_URL}`);
console.log('');

// Since Supabase JS client doesn't support raw SQL,
// we need to use a different approach
console.log('⚠  Note: This script cannot directly execute SQL via the Supabase JS client.');
console.log('');
console.log('Please apply this migration manually:');
console.log('');
console.log('1. Open Supabase Dashboard:');
console.log(`   ${SUPABASE_URL}`);
console.log('');
console.log('2. Go to: SQL Editor → New Query');
console.log('');
console.log('3. Copy and paste the migration SQL from:');
console.log(`   ${migrationFile}`);
console.log('');
console.log('4. Click "Run"');
console.log('');
console.log('═══════════════════════════════════════════════════════');
console.log('');
console.log('SQL Migration Content:');
console.log('---');
console.log(sql);
console.log('---');
console.log('');

// Offer to copy to clipboard if possible
try {
  const clipboardy = require('clipboardy');
  clipboardy.writeSync(sql);
  console.log('✓ SQL copied to clipboard!');
} catch (e) {
  console.log('Hint: Copy the SQL above manually to your clipboard.');
}

console.log('');
console.log('After applying in Supabase, restart the dev server and test the app.');
