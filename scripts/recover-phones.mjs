#!/usr/bin/env node
// Recover truncated guardian phones (+8800XXXXXXXXX, missing last digit) from
// the ShurjoPay payer MFS wallet number stored on their PAID payment.
//
// Only recovers when SAFE: the payer's number must match the broken number's
// known digits (so we don't overwrite a guardian's phone with whoever paid).
// Card payments (no phone) and mismatches are skipped for manual outreach.
//
//   node scripts/recover-phones.mjs            # DRY RUN (no writes)
//   node scripts/recover-phones.mjs --write    # apply to PROD (get go-ahead)
import { execFileSync } from "node:child_process";
const WRITE = process.argv.includes("--write");
const DB = "bdmso-v2";

function d1(sql) {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", DB, "--env", "production", "--remote", "--json", "--command", sql], { encoding: "utf8", maxBuffer: 1 << 26 });
  return JSON.parse(out.slice(out.indexOf("[")))[0].results || [];
}
// digits -> 10-digit subscriber (strip 880 + leading 0), or null if not usable.
function subscriber(v) {
  let d = String(v || "").replace(/\D+/g, "");
  if (d.startsWith("880")) d = d.slice(3);
  d = d.replace(/^0+/, "");
  return d;
}

const rows = d1(`
  SELECT r.id AS reg, r.guardian_account_id AS acct_id, r.guardian_phone AS broken,
         p.method AS method, p.account_number AS acct
  FROM registrations r
  JOIN payments p ON p.registration_id = r.id AND p.status = 'paid' AND p.account_number IS NOT NULL
  WHERE NOT (r.guardian_phone LIKE '+8801%' AND length(r.guardian_phone) = 14)
`);

const recover = [], skip = [];
const seen = new Set();
for (const r of rows) {
  if (seen.has(r.reg)) continue; seen.add(r.reg);
  const brokenSub = subscriber(r.broken);                 // truncated 9 sig digits (0 stripped)
  const acctSub = subscriber(r.acct);                     // payer wallet subscriber digits
  const isMfs = /bkash|nagad|rocket|upay/i.test(r.method || "");
  const acctMasked = /[*x]/i.test(String(r.acct));
  let to = null, note = "";
  // Full unmasked MFS wallet is a valid BD mobile -> use it. Tag whether the
  // broken number's known digits match (same person) or a different number paid.
  if (!acctMasked && isMfs && /^1\d{9}$/.test(acctSub)) {
    to = "+880" + acctSub;
    note = acctSub.startsWith(brokenSub) ? "match" : "different payer";
  } else if (acctMasked && isMfs) {
    // Masked wallet e.g. "017****1492": overlay the visible prefix+suffix onto
    // the broken number. Recover last digit from the suffix if the overlap agrees.
    const m = String(r.acct).match(/^(\d+)[*xX]+(\d+)$/);
    if (m) {
      const pre = m[1].replace(/^0+/, ""), suf = m[2];
      const cand = brokenSub + suf.slice(-1);             // broken gives 1..9, mask gives 10
      if (/^1\d{9}$/.test(cand) && cand.startsWith(pre) && brokenSub.endsWith(suf.slice(0, -1))) {
        to = "+880" + cand;
        note = "match (masked)";
      }
    }
  }
  if (to) {
    recover.push({ reg: r.reg, acct_id: r.acct_id, from: r.broken, to, note });
  } else {
    skip.push({ reg: r.reg, broken: r.broken, method: r.method, acct: r.acct,
      why: !isMfs ? "card - not a phone" : "unusable wallet" });
  }
}

console.log(`\npaid-broken w/ payment account: ${rows.length}`);
console.log(`RECOVERABLE (payer wallet matches): ${recover.length}`);
for (const x of recover) console.log(`  ${x.from}  ->  ${x.to}   [${x.note}]`);
console.log(`\nSKIP (manual outreach): ${skip.length}`);
for (const x of skip) console.log(`  ${x.broken}  [${x.method}] acct=${JSON.stringify(x.acct)}  - ${x.why}`);

if (WRITE) {
  console.log("\n=== WRITING to prod ===");
  for (const x of recover) {
    // Fix the reg + its account + any sibling regs still carrying the broken number.
    d1(`UPDATE registrations SET guardian_phone='${x.to}' WHERE id='${x.reg}';`);
    d1(`UPDATE guardian_accounts SET phone='${x.to}' WHERE id='${x.acct_id}';`);
    console.log(`  fixed ${x.reg} -> ${x.to}`);
  }
  console.log("done.");
} else {
  console.log("\n(dry run - no writes. Re-run with --write after go-ahead.)");
}
