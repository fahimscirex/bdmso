#!/usr/bin/env node
// Create or promote an admin account in local D1.
//
// Usage:
//   node scripts/create-admin.mjs <email> <password>
//
// Idempotent: if the email already exists, the row is updated to role='admin'
// with the new password hash and email_verified=1. If it doesn't exist, a new
// guardian_account row is created with role='admin'.
//
// Password is hashed with PBKDF2 using the same parameters as production
// (worker/lib/crypto.js) so the login flow accepts it.

import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { hashPassword, PBKDF2_ITERATIONS_CURRENT } from "../worker/lib/crypto.js";

const [emailArg, password] = process.argv.slice(2);
if (!emailArg || !password) {
  console.error("Usage: node scripts/create-admin.mjs <email> <password>");
  process.exit(1);
}
const email = emailArg.toLowerCase();

const accountId = `ga_admin_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
const salt = crypto.randomUUID();
const hash = await hashPassword(password, salt, PBKDF2_ITERATIONS_CURRENT);
const now = new Date().toISOString();

const esc = (s) => `'${String(s).replace(/'/g, "''")}'`;

// ON CONFLICT(email) → promote existing account to admin and update password.
const sql = `
INSERT INTO guardian_accounts (
  id, email, password_hash, password_salt, password_iterations,
  full_name, email_verified, role, created_at
) VALUES (
  ${esc(accountId)}, ${esc(email)}, ${esc(hash)}, ${esc(salt)}, ${PBKDF2_ITERATIONS_CURRENT},
  'Admin', 1, 'admin', ${esc(now)}
)
ON CONFLICT(email) DO UPDATE SET
  role = 'admin',
  password_hash = excluded.password_hash,
  password_salt = excluded.password_salt,
  password_iterations = excluded.password_iterations,
  email_verified = 1;
`;

const tmpFile = `/tmp/bdmso-admin-seed-${Date.now()}.sql`;
writeFileSync(tmpFile, sql);

try {
  execSync(`wrangler d1 execute bdmso --local --file=${tmpFile}`, { stdio: "inherit" });
  console.log("");
  console.log(`✓ Admin account ready:`);
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
  console.log("");
  console.log(`Sign in at:`);
  console.log(`  http://localhost:5174/   (with: pnpm --filter @bdmso/admin dev)`);
  console.log(`  http://localhost:8787/admin   (after: pnpm -r build && wrangler dev --config wrangler.prod.toml)`);
} finally {
  unlinkSync(tmpFile);
}
