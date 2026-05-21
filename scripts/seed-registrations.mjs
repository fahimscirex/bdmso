#!/usr/bin/env node
// Seed the local D1 with a handful of fake registrations so the admin
// dashboard has something to show during development.
//
// Usage:
//   node scripts/seed-registrations.mjs           # 10 default fixtures
//   node scripts/seed-registrations.mjs 25        # custom count
//
// Idempotent on the guardian_accounts side (ON CONFLICT(email) updates name).
// Each run appends new registration rows (uniquely keyed by random id).

import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync, readFileSync } from "node:fs";
import { hashPassword, PBKDF2_ITERATIONS_CURRENT } from "../worker/lib/crypto.js";

const COUNT = Math.max(1, Math.min(Number(process.argv[2]) || 10, 500));

const FIRST = ["Aarav", "Ayesha", "Rifat", "Tasnim", "Nabeeh", "Wafia", "Arijit", "Labiba", "Ehan", "Maria", "Tahmid", "Syed", "Tania", "Kabir", "Nashita", "Rahad", "Samin", "Morsheda", "Ovejan", "Farzana"];
const LAST  = ["Saha", "Rahman", "Hossain", "Khan", "Begum", "Ahmed", "Islam", "Hasan", "Iqbal", "Mahmud"];
const SCHOOLS = ["St. Joseph Higher Secondary", "Viqarunnisa Noon School", "Holy Cross School", "Notre Dame School", "Sunbeams School", "Scholastica", "Maple Leaf International", "BAF Shaheen College", "Mastermind School", "Adamjee Cantonment"];
const DISTRICTS = ["Dhaka", "Chittagong", "Sylhet", "Rajshahi", "Khulna", "Barishal", "Rangpur", "Mymensingh"];
const CLASSES = ["Class 2", "Class 3", "Class 4", "Class 5", "Class 6"];
const GENDERS = ["Male", "Female"];
// Registration types to seed. Prices come from the catalog
// (programs-detail.json) - the single source of truth.
const TYPES = [
  "national-olympiad", "national-quiz-competition",
  "stem-foundation", "bdmso-preparatory", "lab-day", "mock-test",
];
const CATALOG = JSON.parse(
  readFileSync(new URL("../public/data/programs-detail.json", import.meta.url), "utf8"),
);
const PRICES = Object.fromEntries(
  CATALOG.map((p) => [p.slug, p.feeAmount ?? 0]),
);

const pick  = (a) => a[Math.floor(Math.random() * a.length)];
const id    = (p) => `${p}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
const esc   = (s) => `'${String(s).replace(/'/g, "''")}'`;
const dobOf = (cls) => {
  // Class 2 → age ~8, Class 6 → age ~12. Pick a roughly-right DOB.
  const ageMap = { "Class 2": 8, "Class 3": 9, "Class 4": 10, "Class 5": 11, "Class 6": 12 };
  const age = ageMap[cls] || 10;
  return `${new Date().getUTCFullYear() - age}-0${1 + Math.floor(Math.random() * 9)}-${10 + Math.floor(Math.random() * 18)}`;
};

const sqlLines = [];

// Shared password hash so all seeded guardians can log in with "test1234".
// Computed once outside the loop because PBKDF2 takes ~50ms per call.
const sharedSalt = crypto.randomUUID();
const sharedHash = await hashPassword("test1234", sharedSalt, PBKDF2_ITERATIONS_CURRENT);

const now = new Date();

for (let i = 0; i < COUNT; i++) {
  const first = pick(FIRST);
  const last  = pick(LAST);
  const cls   = pick(CLASSES);
  const type  = pick(TYPES);
  const gender = pick(GENDERS);
  const school = pick(SCHOOLS);
  const district = pick(DISTRICTS);
  // 60% paid, 30% submitted (awaiting payment), 10% cancelled.
  const roll = Math.random();
  const status = roll < 0.6 ? "paid" : roll < 0.9 ? "submitted" : "cancelled";
  // Spread created_at across the last 60 days.
  const createdAt = new Date(now.getTime() - Math.floor(Math.random() * 60 * 86400000)).toISOString();

  const gaId  = id("ga");
  const appId = id("app");
  const email = `${first.toLowerCase()}.${last.toLowerCase()}+${i}@example.com`;
  const phone = `+8801${String(700000000 + Math.floor(Math.random() * 99999999)).slice(0, 9)}`;

  sqlLines.push(
    `INSERT INTO guardian_accounts (id, email, password_hash, password_salt, password_iterations, full_name, phone, email_verified, role, created_at) ` +
    `VALUES (${esc(gaId)}, ${esc(email)}, ${esc(sharedHash)}, ${esc(sharedSalt)}, ${PBKDF2_ITERATIONS_CURRENT}, ${esc(`${first} ${last} (Parent)`)}, ${esc(phone)}, 1, 'guardian', ${esc(createdAt)}) ON CONFLICT(email) DO NOTHING;`
  );
  sqlLines.push(
    `INSERT INTO registrations (id, registration_type, student_full_name, student_date_of_birth, student_class_name, student_gender, student_school, student_district, guardian_account_id, guardian_full_name, guardian_relationship, guardian_phone, guardian_email, guardian_address, terms_accepted, status, source_page, created_at) ` +
    `VALUES (${esc(appId)}, ${esc(type)}, ${esc(`${first} ${last}`)}, ${esc(dobOf(cls))}, ${esc(cls)}, ${esc(gender)}, ${esc(school)}, ${esc(district)}, ${esc(gaId)}, ${esc(`${first} ${last} (Parent)`)}, 'Parent', ${esc(phone)}, ${esc(email)}, ${esc(`${district}, Bangladesh`)}, 1, ${esc(status)}, 'seed', ${esc(createdAt)});`
  );
  // If paid, also create the matching payment row.
  if (status === "paid") {
    const payId  = id("pay");
    const tranId = id("txn");
    const amount = PRICES[type] || 1000;
    const paidAt = new Date(new Date(createdAt).getTime() + 60 * 60 * 1000).toISOString();
    sqlLines.push(
      `INSERT INTO payments (id, registration_id, amount, currency, tran_id, gateway_status, status, created_at, updated_at) ` +
      `VALUES (${esc(payId)}, ${esc(appId)}, ${amount}, 'BDT', ${esc(tranId)}, 'Completed', 'paid', ${esc(createdAt)}, ${esc(paidAt)});`
    );
  } else if (status === "submitted") {
    // Pending payment row for some of them (so the dashboard shows mixed payment states).
    if (Math.random() < 0.5) {
      const payId  = id("pay");
      const tranId = id("txn");
      const amount = PRICES[type] || 1000;
      sqlLines.push(
        `INSERT INTO payments (id, registration_id, amount, currency, tran_id, status, created_at, updated_at) ` +
        `VALUES (${esc(payId)}, ${esc(appId)}, ${amount}, 'BDT', ${esc(tranId)}, 'pending', ${esc(createdAt)}, ${esc(createdAt)});`
      );
    }
  }
}

// ─── Sponsorship enquiries (smaller pool) ───────────────────────────────────
// Adds ~1 enquiry per 5 registrations, spread across the three statuses,
// so the Sponsorships screen has something to show out of the box.

const ORGS = [
  "Robi Axiata", "Grameenphone", "BRAC", "Pathao", "bKash", "Daraz",
  "Square Pharma", "Beximco", "City Bank", "Walton Group",
];
const INTERESTS = [
  "Title Sponsor", "Gold Tier", "Silver Tier", "Bronze Tier",
  "Venue Partner", "Logistics Partner", "Media Partner",
];
const STATUSES = ["new", "new", "new", "contacted", "contacted", "closed"];

const sponsorshipCount = Math.max(3, Math.round(COUNT / 5));
for (let i = 0; i < sponsorshipCount; i++) {
  const org    = pick(ORGS);
  const first  = pick(FIRST);
  const last   = pick(LAST);
  const intr   = pick(INTERESTS);
  const status = pick(STATUSES);
  const createdAt = new Date(now.getTime() - Math.floor(Math.random() * 45 * 86400000)).toISOString();
  const enqId = id("enq");
  const email = `${first.toLowerCase()}.${last.toLowerCase()}+sponsor${i}@${org.toLowerCase().replace(/[^a-z]/g, "")}.example`;
  const phone = `+8801${String(700000000 + Math.floor(Math.random() * 99999999)).slice(0, 9)}`;
  const message = `Hi, we're exploring ways ${org} can partner with BdMSO 2026. Interested in the ${intr} package - please share the deck and timeline.`;

  sqlLines.push(
    `INSERT INTO sponsorship_enquiries (id, organization, contact_person, email, phone, interest, message, status, source_page, created_at) ` +
    `VALUES (${esc(enqId)}, ${esc(org)}, ${esc(`${first} ${last}`)}, ${esc(email)}, ${esc(phone)}, ${esc(intr)}, ${esc(message)}, ${esc(status)}, 'seed', ${esc(createdAt)});`
  );
}

const tmpFile = `/tmp/bdmso-seed-${Date.now()}.sql`;
writeFileSync(tmpFile, sqlLines.join("\n") + "\n");

try {
  execSync(`wrangler d1 execute bdmso --local --file=${tmpFile}`, { stdio: "inherit" });
  console.log("");
  console.log(`✓ Seeded ${COUNT} registrations + ${sponsorshipCount} sponsorship enquiries.`);
  console.log(`  Open /admin → Registrations / Sponsorships to see them.`);
  console.log(`  Seeded guardians all share password: test1234`);
} finally {
  unlinkSync(tmpFile);
}
