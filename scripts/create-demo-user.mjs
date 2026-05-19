#!/usr/bin/env node
// Provision a single deterministic guardian account + one fresh pending
// registration so the shurjoPay sandbox flow can be tested end to end.
//
//   Email:    demo@bdmso.test
//   Password: test1234
//
// Idempotent. Safe to re-run any time — the guardian is upserted, and any
// previous demo registrations are cleared first so you always end up with
// exactly one fresh "submitted" registration ready to pay.

import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { hashPassword, PBKDF2_ITERATIONS_CURRENT } from "../worker/lib/crypto.js";

const EMAIL    = "demo@bdmso.test";
const PASSWORD = "test1234";
const NAME     = "Demo Guardian";

// Fixed account id so re-runs keep the same row; the registration id is
// random because each run creates a fresh "submitted" registration.
const ACCOUNT_ID = "ga_demo_user_00000000000";
const REG_ID     = `app_demo_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

const salt = crypto.randomUUID();
const hash = await hashPassword(PASSWORD, salt, PBKDF2_ITERATIONS_CURRENT);

const esc = (s) => `'${String(s).replace(/'/g, "''")}'`;
const now = new Date().toISOString();

const sqlLines = [
  // 1. Upsert the guardian. email_verified=1 so payment is allowed without
  //    needing to click a verification link.
  `INSERT INTO guardian_accounts (id, email, password_hash, password_salt, password_iterations, full_name, phone, email_verified, role, created_at)
   VALUES (${esc(ACCOUNT_ID)}, ${esc(EMAIL)}, ${esc(hash)}, ${esc(salt)}, ${PBKDF2_ITERATIONS_CURRENT}, ${esc(NAME)}, '+8801712345678', 1, 'guardian', ${esc(now)})
   ON CONFLICT(email) DO UPDATE SET
     password_hash       = excluded.password_hash,
     password_salt       = excluded.password_salt,
     password_iterations = excluded.password_iterations,
     full_name           = excluded.full_name,
     email_verified      = 1;`,

  // 2. Wipe previous demo payments + registrations so a re-run lands you
  //    back in a clean "one pending registration" state.
  `DELETE FROM payments WHERE registration_id IN (SELECT id FROM registrations WHERE guardian_account_id = (SELECT id FROM guardian_accounts WHERE email = ${esc(EMAIL)}));`,
  `DELETE FROM registrations WHERE guardian_account_id = (SELECT id FROM guardian_accounts WHERE email = ${esc(EMAIL)});`,

  // 3. One fresh pending registration. National Qualifying Round = ৳1000,
  //    which is small enough to be friendly in sandbox and big enough to
  //    not be silently free-flowed through the amount===0 fast path.
  `INSERT INTO registrations (id, registration_type, student_full_name, student_date_of_birth, student_class_name, student_gender, student_school, student_district, guardian_account_id, guardian_full_name, guardian_relationship, guardian_phone, guardian_email, guardian_address, terms_accepted, status, source_page, created_at)
   SELECT ${esc(REG_ID)}, 'national-qualifying-round', 'Demo Student', '2016-04-15', 'Class 4', 'Female', 'Demo School', 'Dhaka',
          a.id, ${esc(NAME)}, 'Parent', '+8801712345678', ${esc(EMAIL)}, 'Demo address, Dhaka', 1, 'submitted', 'seed', ${esc(now)}
   FROM guardian_accounts a WHERE a.email = ${esc(EMAIL)};`,
];

const tmpFile = `/tmp/bdmso-demo-${Date.now()}.sql`;
writeFileSync(tmpFile, sqlLines.join("\n\n") + "\n");

try {
  execSync(`wrangler d1 execute bdmso --local --file=${tmpFile}`, { stdio: "inherit" });
  console.log("");
  console.log("✓ Demo user ready.");
  console.log("");
  console.log(`  URL:      http://localhost:8787/dashboard`);
  console.log(`  Email:    ${EMAIL}`);
  console.log(`  Password: ${PASSWORD}`);
  console.log("");
  console.log(`  Open the dashboard, sign in, click "Pay" on the pending`);
  console.log(`  registration. You'll be sent to the shurjoPay sandbox.`);
  console.log(`  Use any of the sandbox payment options to complete.`);
} finally {
  unlinkSync(tmpFile);
}
