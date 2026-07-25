#!/usr/bin/env node
/**
 * Apply a SQL migration file to Supabase Postgres.
 * Usage: DATABASE_URL="postgresql://postgres.[ref]:[password]@..." node scripts/apply-sql-migration.mjs supabase/migrations/20250609140000_var_phong_ban.sql
 */
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const fileArg = process.argv[2];
const databaseUrl = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;

if (!fileArg) {
  console.error('Usage: DATABASE_URL=... node scripts/apply-sql-migration.mjs <path-to.sql>');
  process.exit(1);
}

if (!databaseUrl) {
  console.error('Missing DATABASE_URL or SUPABASE_DB_URL');
  process.exit(1);
}

const sqlPath = path.resolve(fileArg);
const sql = fs.readFileSync(sqlPath, 'utf8');
const db = postgres(databaseUrl, { max: 1 });

try {
  await db.unsafe(sql);
  console.log(`Applied: ${sqlPath}`);
} finally {
  await db.end({ timeout: 5 });
}
