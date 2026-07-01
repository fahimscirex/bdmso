// Admin-tier endpoints - mounted under /api/admin/*. Role-gated to admin
// only at the namespace level.
//
// Mutating handlers should call recordAudit(env, session.account_id, "...", {...})
// after a successful change so the action shows up in admin_audit_log.

import { Hono } from "hono";
import { sessionMiddleware } from "../middleware/session.js";
import { requireRole } from "../middleware/requireRole.js";
import { recordAudit } from "../lib/audit-log.js";
import { getCatalog } from "../lib/programs.js";
import { deriveCohortStage } from "../lib/program-options.js";
import { writeRepoAsset } from "../lib/repoAssets.js";
import { reconcilePayment, reconcileStalePayments } from "../lib/reconcile.js";
import { materializeEntity, titleFor, pathFor, isDataset, publishFiles, captureSnapshot, restoreSnapshot, diffEntityFields } from "../lib/publish.js";
import { createId } from "../lib/util.js";
import { createVerificationToken, sendVerificationEmail, createPasswordResetToken, sendPasswordResetEmail, assignMemberIdAndSendReceipt, sendBroadcastEmail } from "../lib/email.js";
import { getBaseUrl } from "../lib/util.js";
import { checkActionRateLimit, recordActionAttempt, clientIpFor } from "../lib/rate-limit.js";
import { getBoolSetting, setSetting } from "../lib/settings.js";

const admin = new Hono();

// Short edge-cache for read-heavy GLOBAL aggregates (analytics, reports) to cut
// D1 rows-read. The data is not per-admin, so one cached copy is shared across
// admins in a colo. 60s staleness is fine for dashboard/report numbers; writes
// just surface up to a minute later. Keyed by a synthetic URL so all admins hit
// the same entry regardless of auth headers.
const cacheReq = (key) => new Request(`https://d1cache.local/${encodeURIComponent(key)}`);
async function cacheGet(key) {
  try { return (await caches.default.match(cacheReq(key))) || null; } catch { return null; }
}
// Only the EDGE copy (stored in caches.default) carries max-age so the cache
// honours the TTL; the copy returned to the browser is always `private, no-store`
// so authenticated admin data is never kept in the browser or a shared proxy.
// Safe to share one entry across admins because these endpoints return GLOBAL
// data only - do not cache anything per-admin through here.
function cacheHit(hit) {
  const r = new Response(hit.body, hit);
  r.headers.set("Cache-Control", "private, no-store");
  r.headers.set("x-cache", "HIT");
  return r;
}
async function cachePut(c, key, ttl, data) {
  const stored = new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json", "cache-control": `max-age=${ttl}` },
  });
  // Await the put so the entry is stored before we respond (the write is cheap
  // next to the aggregates we just ran). Errors are non-fatal - still serve data.
  try { await caches.default.put(cacheReq(key), stored.clone()); }
  catch (e) { console.log("[cache] put failed:", e?.message || e); }
  const out = c.json(data);
  out.headers.set("Cache-Control", "private, no-store");
  out.headers.set("x-cache", "MISS");
  return out;
}

admin.use("*", sessionMiddleware);
admin.use("*", requireRole("admin"));
// Per-IP cap across the entire admin namespace. Each dashboard/list page fires
// several GETs and a few views poll, so a real admin session legitimately makes
// hundreds of requests in a sitting - 1500 per 15 minutes stays well clear of
// that while still stopping a stolen admin token from scraping data fast.
// Skipped in local dev, where hot-reload refetches trip any cap.
admin.use("*", async (c, next) => {
  if (c.env.ENVIRONMENT === "development") return next();
  const ip = clientIpFor(c.req.raw);
  if (!(await checkActionRateLimit(c.env, "admin-ip", ip, 1500, 15 * 60 * 1000))) {
    return c.json({ error: "Too many admin requests. Slow down." }, 429);
  }
  await recordActionAttempt(c.env, "admin-ip", ip);
  return next();
});

// Smoke-test endpoint. Useful for the admin SPA to verify the bearer token
// is still valid + the user is still an admin (e.g. after a long idle).
admin.get("/health", (c) => {
  const session = c.get("session");
  return c.json({
    ok: true,
    accountId: session.account_id,
    email: session.email,
    role: session.role,
    serverTime: new Date().toISOString(),
  });
});

// ─── Runtime settings (admin toggles) ──────────────────────────────────────
// Declared AFTER the session/requireRole middleware above, so these are
// auth-gated and `session` is available. GET reads, PATCH flips a known toggle.
admin.get("/settings", async (c) => {
  return c.json({ ok: true, offlinePaymentEnabled: await getBoolSetting(c.env, "offline_payment_enabled", true) });
});

admin.patch("/settings", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (typeof body.offlinePaymentEnabled === "boolean") {
    await setSetting(c.env, "offline_payment_enabled", body.offlinePaymentEnabled ? "1" : "0");
    const session = c.get("session");
    await recordAudit(c.env, session.account_id, "settings.update", {
      type: "settings", id: "offline_payment_enabled",
      payload: { offlinePaymentEnabled: body.offlinePaymentEnabled },
    });
  }
  return c.json({ ok: true, offlinePaymentEnabled: await getBoolSetting(c.env, "offline_payment_enabled", true) });
});

// ─── Registrations ────────────────────────────────────────────────────────────
//
// GET /api/admin/registrations
//   Returns all registrations with the latest payment row joined.
//   Query params (all optional):
//     status   - registration status filter ('submitted'|'paid'|'cancelled')
//     type     - registration_type slug filter
//     limit    - max rows (default 200, hard cap 1000)
//
// Sort: newest first.
// Sortable columns whitelist. Anything else falls back to created_at.
const REG_SORTABLE = {
  created: "r.created_at",
  student: "r.student_full_name",
  school:  "r.student_school",
  class:   "r.student_class_name",
  payment: "p.status",
  amount:  "p.amount",
};

admin.get("/registrations", async (c) => {
  const catalog = await getCatalog(c);
  const status   = c.req.query("status");
  const type     = c.req.query("type");
  const venue    = c.req.query("venue");
  const klass    = c.req.query("class");
  const gender   = c.req.query("gender");
  const district = c.req.query("district");
  const from     = c.req.query("from");      // YYYY-MM-DD
  const to       = c.req.query("to");        // YYYY-MM-DD
  const hasCoupon = c.req.query("hasCoupon"); // "1"
  const stuck    = c.req.query("stuck");      // "1" → submitted >72h
  const q        = c.req.query("q");
  const limit    = Math.min(Number(c.req.query("limit")) || 50, 1000);
  const offset   = Math.max(0, Number(c.req.query("offset")) || 0);
  const sortKey  = c.req.query("sort") || "created";
  const sortDir  = c.req.query("dir") === "asc" ? "ASC" : "DESC";
  const sortCol  = REG_SORTABLE[sortKey] || REG_SORTABLE.created;

  const wheres = [];
  const binds  = [];
  if (status)   { wheres.push("r.status = ?");            binds.push(status); }
  if (type)     { wheres.push("r.registration_type = ?"); binds.push(type); }
  if (venue)    { wheres.push("r.preferred_venue = ?");   binds.push(venue); }
  if (klass)    { wheres.push("r.student_class_name = ?");binds.push(klass); }
  if (gender)   { wheres.push("r.student_gender = ?");    binds.push(gender); }
  if (district) { wheres.push("r.student_district = ?");  binds.push(district); }
  if (from)     { wheres.push("date(r.created_at) >= ?"); binds.push(from); }
  if (to)       { wheres.push("date(r.created_at) <= ?"); binds.push(to); }
  if (stuck === "1") {
    wheres.push("r.status = 'submitted' AND r.created_at < datetime('now', '-3 days')");
  }
  if (hasCoupon === "1") {
    wheres.push("EXISTS (SELECT 1 FROM payments WHERE registration_id = r.id AND coupon_code IS NOT NULL AND coupon_code != '')");
  }
  if (q) {
    wheres.push("(r.student_full_name LIKE ? OR r.guardian_full_name LIKE ? OR r.guardian_email LIKE ? OR r.guardian_phone LIKE ? OR r.student_school LIKE ?)");
    const like = `%${q}%`;
    binds.push(like, like, like, like, like);
  }
  const whereSql = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";

  // Paginated rows + total count (for the pager) + summary (for the header
  // tiles). All three in parallel.
  const [rowsRes, totalRes, summary, facetsRes] = await Promise.all([
    c.env.DB.prepare(`
      SELECT
        r.id,
        r.registration_type,
        r.student_full_name,
        r.student_class_name,
        r.student_gender,
        r.student_school,
        r.student_district,
        r.preferred_venue,
        r.preferred_subject,
        r.program_options,
        r.guardian_full_name,
        r.guardian_email,
        r.guardian_phone,
        r.status,
        r.created_at,
        a.member_id AS bdmso_id,
        (CASE WHEN r.status = 'submitted'
              AND r.created_at < datetime('now', '-3 days')
              THEN 1 ELSE 0 END)                            AS stuck,
        (SELECT COUNT(*) FROM registration_notes WHERE registration_id = r.id) AS notes_count,
        p.status     AS payment_status,
        p.amount     AS payment_amount,
        p.tran_id    AS payment_tran_id,
        p.coupon_code AS payment_coupon,
        p.updated_at AS payment_updated_at
      FROM registrations r
      LEFT JOIN guardian_accounts a ON a.id = r.guardian_account_id
      LEFT JOIN payments p ON p.id = (
        SELECT id FROM payments WHERE registration_id = r.id ORDER BY CASE status WHEN 'paid' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, created_at DESC LIMIT 1
      )
      ${whereSql}
      ORDER BY ${sortCol} ${sortDir}, r.id ${sortDir}
      LIMIT ? OFFSET ?
    `).bind(...binds, limit, offset).all(),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM registrations r ${whereSql}`).bind(...binds).first(),
    c.env.DB.prepare(`
      SELECT
        COUNT(*)                                                   AS total,
        SUM(CASE WHEN status = 'paid'      THEN 1 ELSE 0 END)      AS paid,
        SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END)      AS pending,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)      AS cancelled
      FROM registrations
    `).first(),
    // Facets for the filter chip row (distinct values for class, venue, district).
    c.env.DB.prepare(`
      SELECT
        json_group_array(DISTINCT student_class_name) AS classes,
        json_group_array(DISTINCT preferred_venue)    AS venues,
        json_group_array(DISTINCT student_district)   AS districts
      FROM registrations
      WHERE student_full_name IS NOT NULL
    `).first(),
  ]);

  const enriched = (rowsRes.results || []).map((r) => ({
    ...r,
    program_label: catalog.nameFor(r.registration_type),
    fee_amount: catalog.priceFor(r.registration_type), // expected fee, for "amount due" on unpaid rows
    stuck: Number(r.stuck) === 1,
    notes_count: Number(r.notes_count) || 0,
  }));

  const safeJsonArr = (v) => {
    try { return (JSON.parse(v) || []).filter((x) => x != null && x !== "").sort(); }
    catch { return []; }
  };

  return c.json({
    ok: true,
    rows: enriched,
    total: Number(totalRes?.n) || 0,
    summary: {
      total:     Number(summary?.total)     || 0,
      paid:      Number(summary?.paid)      || 0,
      pending:   Number(summary?.pending)   || 0,
      cancelled: Number(summary?.cancelled) || 0,
    },
    facets: {
      classes:   safeJsonArr(facetsRes?.classes),
      venues:    safeJsonArr(facetsRes?.venues),
      districts: safeJsonArr(facetsRes?.districts),
    },
    filter: {
      status: status || null, type: type || null, venue: venue || null,
      class: klass || null, gender: gender || null, district: district || null,
      from: from || null, to: to || null,
      hasCoupon: hasCoupon === "1", stuck: stuck === "1",
      q: q || null,
      sort: sortKey, dir: sortDir.toLowerCase(),
      limit, offset,
    },
  });
});

// GET /api/admin/registrations/:id
// Full registration + all payments + guardian profile.
admin.get("/registrations/:id", async (c) => {
  const id = c.req.param("id");

  // BdMSO ID lives on the guardian account (one per account, reused
  // across that student's programs), so read member_id from there -
  // registrations.member_id is never populated.
  const reg = await c.env.DB.prepare(`
    SELECT r.*,
           a.email_verified AS guardian_email_verified,
           a.member_id      AS account_member_id
    FROM registrations r
    JOIN guardian_accounts a ON a.id = r.guardian_account_id
    WHERE r.id = ?
    LIMIT 1
  `).bind(id).first();
  if (!reg) return c.json({ error: "Registration not found." }, 404);

  // All payments for this guardian (across their registrations), each tagged
  // with the program + class it paid for - so the detail page shows one
  // consolidated payment history rather than per-registration silos.
  const payments = await c.env.DB.prepare(
    `SELECT p.*, r2.registration_type AS program, r2.student_class_name AS class_name, r2.status AS reg_status
     FROM payments p
     JOIN registrations r2 ON r2.id = p.registration_id
     WHERE r2.guardian_account_id = ?
     ORDER BY p.created_at DESC`
  ).bind(reg.guardian_account_id).all();

  // The guardian's other registrations (e.g. they registered for the Olympiad
  // and a mock test separately) - shown so this per-registration page makes
  // clear what else the student is signed up for.
  const siblings = await c.env.DB.prepare(
    `SELECT id, registration_type, status, preferred_subject, preferred_venue, program_options, cohort_key, created_at
     FROM registrations
     WHERE guardian_account_id = ? AND id != ?
     ORDER BY created_at DESC`
  ).bind(reg.guardian_account_id, id).all();

  return c.json({ ok: true, registration: reg, payments: payments.results, siblings: siblings.results });
});

// PATCH /api/admin/registrations/:id/status
// Body: { status: 'submitted'|'paid'|'cancelled' }
admin.patch("/registrations/:id/status", async (c) => {
  const id = c.req.param("id");
  const { status } = await c.req.json();
  const allowed = ["submitted", "paid", "cancelled"];
  if (!allowed.includes(status)) {
    return c.json({ error: `Invalid status. Allowed: ${allowed.join(", ")}` }, 400);
  }

  const before = await c.env.DB.prepare(
    "SELECT id, status FROM registrations WHERE id = ? LIMIT 1"
  ).bind(id).first();
  if (!before) return c.json({ error: "Registration not found." }, 404);

  await c.env.DB.prepare("UPDATE registrations SET status = ? WHERE id = ?").bind(status, id).run();
  // Cancelling a registration cancels its still-pending payments too (matches the
  // guardian cancel flow), so the payments list visibly reflects the change.
  if (status === "cancelled") {
    await c.env.DB.prepare(
      "UPDATE payments SET status = 'cancelled', updated_at = datetime('now') WHERE registration_id = ? AND status = 'pending'"
    ).bind(id).run();
  }

  const session = c.get("session");
  await recordAudit(c.env, session.account_id, "registration.update_status", {
    type: "registration",
    id,
    payload: { from: before.status, to: status },
  });

  return c.json({ ok: true, id, status });
});

// PATCH /api/admin/registrations/:id
// Whitelist-update editable student/guardian fields on a registration. Only
// the fields present in the body are touched; everything else is ignored.
admin.patch("/registrations/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const allowed = [
    "student_full_name", "student_date_of_birth", "student_class_name",
    "student_gender", "student_medium", "student_school", "student_district",
    "guardian_full_name", "guardian_relationship", "guardian_phone",
    "guardian_email", "guardian_address",
  ];
  const sets = [];
  const binds = [];
  for (const field of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      sets.push(`${field} = ?`);
      binds.push(body[field]);
    }
  }
  if (!sets.length) return c.json({ error: "No updatable fields provided." }, 400);

  const before = await c.env.DB.prepare(
    "SELECT id FROM registrations WHERE id = ? LIMIT 1"
  ).bind(id).first();
  if (!before) return c.json({ error: "Registration not found." }, 404);

  binds.push(id);
  await c.env.DB.prepare(
    `UPDATE registrations SET ${sets.join(", ")} WHERE id = ?`
  ).bind(...binds).run();

  const session = c.get("session");
  await recordAudit(c.env, session.account_id, "registration.update_fields", {
    type: "registration", id, payload: { fields: sets.map((s) => s.split(" = ")[0]) },
  });
  return c.json({ ok: true, id });
});

// POST /api/admin/registrations/:id/resend-verification
// Re-sends the email-verification link to the registration's guardian
// account. Friendly no-op if the address is already verified.
admin.post("/registrations/:id/resend-verification", async (c) => {
  const id = c.req.param("id");
  const reg = await c.env.DB.prepare(
    "SELECT id, guardian_account_id FROM registrations WHERE id = ? LIMIT 1"
  ).bind(id).first();
  if (!reg) return c.json({ error: "Registration not found." }, 404);

  const account = await c.env.DB.prepare(
    "SELECT id, email, email_verified FROM guardian_accounts WHERE id = ? LIMIT 1"
  ).bind(reg.guardian_account_id).first();
  if (!account) return c.json({ error: "Guardian account not found." }, 404);
  if (account.email_verified) return c.json({ ok: true, alreadyVerified: true });

  await c.env.DB.prepare("DELETE FROM email_verification_tokens WHERE account_id = ?")
    .bind(account.id).run();
  const token = await createVerificationToken(c.env, account.id);
  const verifyUrl = `${getBaseUrl(c.req.raw)}/api/verify-email?token=${token}`;
  await sendVerificationEmail(c.env, account.email, verifyUrl);

  const session = c.get("session");
  await recordAudit(c.env, session.account_id, "registration.resend_verification", {
    type: "registration", id, payload: { email: account.email },
  });
  return c.json({ ok: true, alreadyVerified: false });
});

// PATCH /api/admin/payments/:id/status
// Manual override of a single payment's status (offline/reconciled payments,
// stuck gateway). Marking a payment paid cascades its registration to paid,
// mirroring the live callback. Audited - this can diverge from the gateway.
admin.patch("/payments/:id/status", async (c) => {
  const id = c.req.param("id");
  const { status } = await c.req.json().catch(() => ({}));
  if (!["paid", "failed", "pending"].includes(status)) {
    return c.json({ error: "status must be paid, failed, or pending." }, 400);
  }
  const row = await c.env.DB.prepare(
    "SELECT id, status, registration_id FROM payments WHERE id = ? LIMIT 1"
  ).bind(id).first();
  if (!row) return c.json({ error: "Payment not found." }, 404);

  // Atomic: flip the payment and (if going paid) cascade the registration in one
  // batch so a mid-sequence failure can't leave them inconsistent.
  const stmts = [
    c.env.DB.prepare(
      "UPDATE payments SET status = ?, gateway_status = 'Manual (admin)', updated_at = datetime('now') WHERE id = ?"
    ).bind(status, id),
  ];
  if (status === "paid" && row.registration_id) {
    stmts.push(c.env.DB.prepare("UPDATE registrations SET status = 'paid' WHERE id = ?").bind(row.registration_id));
  }
  await c.env.DB.batch(stmts);

  const session = c.get("session");
  await recordAudit(c.env, session.account_id, "payment.status_manual", {
    type: "payment", id, payload: { from: row.status, to: status, manual: true },
  });
  return c.json({ ok: true, status });
});

// PATCH /api/admin/payments/:id/complete
// Settle a manual (cash/bank/offline) payment: flip it to paid, record the
// method (default 'cash') and optional account number, cascade the registration
// to paid, then mint the member id + send the receipt (keyed by tran_id).
admin.patch("/payments/:id/complete", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const method = (typeof body.method === "string" && body.method.trim()) ? body.method.trim() : "cash";
  const accountNumber = typeof body.accountNumber === "string" && body.accountNumber.trim()
    ? body.accountNumber.trim() : null;

  const row = await c.env.DB.prepare(
    "SELECT id, status, registration_id, tran_id FROM payments WHERE id = ? LIMIT 1"
  ).bind(id).first();
  if (!row) return c.json({ error: "Payment not found." }, 404);

  // Atomic: settle the payment and cascade the registration to paid in one batch.
  const stmts = [
    c.env.DB.prepare(
      "UPDATE payments SET status = 'paid', method = ?, account_number = COALESCE(?, account_number), channel = 'manual', gateway_status = 'Manual (admin)', updated_at = datetime('now') WHERE id = ?"
    ).bind(method, accountNumber, id),
  ];
  if (row.registration_id) {
    stmts.push(c.env.DB.prepare("UPDATE registrations SET status = 'paid' WHERE id = ?").bind(row.registration_id));
  }
  await c.env.DB.batch(stmts);

  // Mint the BdMSO member id + send the receipt (idempotent on the mint).
  await assignMemberIdAndSendReceipt(c.env, row.tran_id, getBaseUrl(c.req.raw));

  const session = c.get("session");
  await recordAudit(c.env, session.account_id, "payment.complete_manual", {
    type: "payment", id, payload: { from: row.status, to: "paid", method },
  });
  return c.json({ ok: true, status: "paid" });
});

// POST /api/admin/registrations/:id/record-payment  { method?, amount?, accountNumber? }
// The one true "they paid offline" action. Completes the registration's pending
// payment, or CREATES a paid one if it never started payment (e.g. a 'submitted'
// reg with no payment row). Either way it tags channel='manual' (so it lands in
// Cash collection, not shurjoPay), confirms the registration, mints the BdMSO
// ID, and emails the receipt. Replaces the old status-only "Mark as paid",
// which silently skipped the payment, receipt, member id, and revenue.
admin.post("/registrations/:id/record-payment", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const method = (typeof body.method === "string" && body.method.trim()) ? body.method.trim() : "cash";
  const accountNumber = typeof body.accountNumber === "string" && body.accountNumber.trim() ? body.accountNumber.trim() : null;

  const reg = await c.env.DB.prepare(
    "SELECT id, registration_type, status, cohort_key FROM registrations WHERE id = ? LIMIT 1"
  ).bind(id).first();
  if (!reg) return c.json({ error: "Registration not found." }, 404);

  // Prefer completing an existing unpaid payment (pending before failed).
  const existing = await c.env.DB.prepare(
    "SELECT id, tran_id FROM payments WHERE registration_id = ? AND status != 'paid' ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC LIMIT 1"
  ).bind(id).first();

  let tranId;
  const stmts = [];
  if (existing) {
    tranId = existing.tran_id;
    stmts.push(c.env.DB.prepare(
      "UPDATE payments SET status = 'paid', method = ?, account_number = COALESCE(?, account_number), channel = 'manual', gateway_status = 'Manual (admin)', updated_at = datetime('now') WHERE id = ?"
    ).bind(method, accountNumber, existing.id));
  } else {
    // No payment row yet: create a paid one. Amount = explicit override, else the
    // program's flat fee (admin passes amount for option-priced programs).
    const catalog = await getCatalog(c);
    const amount = Number.isFinite(Number(body.amount)) && Number(body.amount) >= 0
      ? Number(body.amount)
      : (catalog.priceFor(reg.registration_type) || 0);
    const now = new Date().toISOString();
    tranId = createId("txn");
    stmts.push(c.env.DB.prepare(
      "INSERT INTO payments (id, registration_id, amount, currency, tran_id, channel, method, account_number, status, cohort_key, gateway_status, created_at, updated_at) VALUES (?, ?, ?, 'BDT', ?, 'manual', ?, ?, 'paid', ?, 'Manual (admin)', ?, ?)"
    ).bind(createId("pay"), id, amount, tranId, method, accountNumber, reg.cohort_key, now, now));
  }
  stmts.push(c.env.DB.prepare("UPDATE registrations SET status = 'paid' WHERE id = ?").bind(id));
  await c.env.DB.batch(stmts);

  // Mint the BdMSO member id + send the receipt (idempotent on the mint).
  await assignMemberIdAndSendReceipt(c.env, tranId, getBaseUrl(c.req.raw));

  const session = c.get("session");
  await recordAudit(c.env, session.account_id, "payment.record_manual", {
    type: "registration", id, payload: { method, created: !existing },
  });
  return c.json({ ok: true });
});

// POST /api/admin/payments/:id/resend-receipt
// Re-send the receipt for one specific (paid) payment.
admin.post("/payments/:id/resend-receipt", async (c) => {
  const id = c.req.param("id");
  const payment = await c.env.DB.prepare(
    "SELECT id, tran_id, status FROM payments WHERE id = ? LIMIT 1"
  ).bind(id).first();
  if (!payment) return c.json({ error: "Payment not found." }, 404);
  if (payment.status !== "paid") return c.json({ error: "Only a paid payment has a receipt to send." }, 400);

  await assignMemberIdAndSendReceipt(c.env, payment.tran_id, getBaseUrl(c.req.raw));

  const session = c.get("session");
  await recordAudit(c.env, session.account_id, "payment.resend_receipt", {
    type: "payment", id, payload: { tran_id: payment.tran_id },
  });
  return c.json({ ok: true });
});

// ─── Payments ────────────────────────────────────────────────────────────────
//
// GET /api/admin/payments
// Query params: status (pending|paid|failed), limit (default 200)
admin.get("/payments", async (c) => {
  const status = c.req.query("status");
  const limit  = Math.min(Number(c.req.query("limit")) || 200, 1000);

  const wheres = [];
  const binds  = [];
  if (status) { wheres.push("p.status = ?"); binds.push(status); }
  const whereSql = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";

  const rows = await c.env.DB.prepare(`
    SELECT
      p.id, p.amount, p.currency, p.tran_id, p.val_id, p.gateway_status,
      p.method, p.account_number, p.channel,
      p.status, p.coupon_code, p.created_at, p.updated_at,
      r.id                AS registration_id,
      r.registration_type,
      r.preferred_subject,
      r.program_options,
      r.student_full_name,
      r.guardian_full_name,
      r.guardian_email,
      a.member_id         AS bdmso_id,
      prog.title          AS program_label
    FROM payments p
    LEFT JOIN registrations r     ON r.id = p.registration_id
    LEFT JOIN guardian_accounts a ON a.id = r.guardian_account_id
    LEFT JOIN programs prog       ON prog.slug = r.registration_type
    ${whereSql}
    ORDER BY p.updated_at DESC
    LIMIT ?
  `).bind(...binds, limit).all();

  const summary = await c.env.DB.prepare(`
    SELECT
      COUNT(*)                                                        AS total,
      SUM(CASE WHEN status = 'paid'    THEN 1 ELSE 0 END)             AS paid,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)             AS pending,
      SUM(CASE WHEN status = 'failed'  THEN 1 ELSE 0 END)             AS failed,
      COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS revenue
    FROM payments
  `).first();

  return c.json({
    ok: true,
    rows: rows.results,
    summary: {
      total:   Number(summary?.total)   || 0,
      paid:    Number(summary?.paid)    || 0,
      pending: Number(summary?.pending) || 0,
      failed:  Number(summary?.failed)  || 0,
      revenue: Number(summary?.revenue) || 0,
    },
    filter: { status: status || null, limit },
  });
});

// POST /api/admin/payments/:id/reconcile
// Re-verifies a single pending payment against ShurjoPay and, if confirmed,
// claims it paid and runs the post-payment side effects (member id, receipt,
// coupon count) exactly once — same as the live callback. Only works on
// payments with status = 'pending'.
admin.post("/payments/:id/reconcile", async (c) => {
  const id = c.req.param("id");
  const payment = await c.env.DB.prepare(
    "SELECT id, tran_id, val_id, amount, created_at, registration_id, status, coupon_code, purpose, proposed_options FROM payments WHERE id = ? LIMIT 1"
  ).bind(id).first();
  if (!payment) return c.json({ error: "Payment not found." }, 404);
  if (payment.status !== "pending") {
    return c.json({ error: `Payment is already ${payment.status}.` }, 400);
  }
  if (!payment.val_id) {
    return c.json({ error: "Payment has no ShurjoPay order ID (val_id). Cannot verify." }, 400);
  }

  try {
    const result = await reconcilePayment(c.env, payment, getBaseUrl(c.req.raw));
    const session = c.get("session");
    await recordAudit(c.env, session.account_id, "payment.reconcile", {
      type: "payment", id: payment.id,
      payload: { tran_id: payment.tran_id, ...result },
    });
    return c.json({ ok: true, ...result });
  } catch (err) {
    console.error("payment reconcile failed:", err);
    return c.json({ error: "Reconciliation failed. Something went wrong." }, 502);
  }
});

// POST /api/admin/payments/reconcile-stale   body: { all?: bool }
// Bulk re-verify pending payments against shurjoPay. Default: only those older
// than 30 minutes (the cron's job). With { all: true } it re-verifies EVERY
// pending payment regardless of age - the on-demand "clear the backlog" trigger
// (e.g. right after a deploy that fixes the success-detection logic).
admin.post("/payments/reconcile-stale", async (c) => {
  let all = false;
  try { all = (await c.req.json())?.all === true; } catch { /* no body */ }
  try {
    const result = await reconcileStalePayments(c.env, getBaseUrl(c.req.raw), all ? 0 : undefined);
    const session = c.get("session");
    await recordAudit(c.env, session.account_id, "payment.reconcile_bulk", {
      type: "payment", id: "bulk", payload: { ...result, scope: all ? "all" : "stale" },
    });
    return c.json({ ok: true, ...result });
  } catch (err) {
    console.error("bulk payment reconcile failed:", err);
    return c.json({ error: "Bulk reconciliation failed. Something went wrong." }, 502);
  }
});

// GET /api/admin/payments/reports?period=day|week|month&from=&to=
// Aggregated revenue + count, grouped by the requested period. Server-side
// SQL does the bucketing; client just renders.
admin.get("/payments/reports", async (c) => {
  const period = c.req.query("period") === "month" ? "month"
              : c.req.query("period") === "week"   ? "week"
              : "day";
  const from   = c.req.query("from") || null;
  const to     = c.req.query("to")   || null;

  // SQLite has strftime; %Y-%m-%d = day, %Y-%W = ISO week, %Y-%m = month.
  const fmt = period === "month" ? "%Y-%m" : period === "week" ? "%Y-W%W" : "%Y-%m-%d";

  const wheres = ["status = 'paid'"];
  const binds  = [];
  if (from) { wheres.push("date(updated_at) >= ?"); binds.push(from); }
  if (to)   { wheres.push("date(updated_at) <= ?"); binds.push(to); }
  const whereSql = `WHERE ${wheres.join(" AND ")}`;

  const buckets = await c.env.DB.prepare(`
    SELECT strftime('${fmt}', updated_at) AS bucket,
           COUNT(*)                       AS count,
           COALESCE(SUM(amount), 0)       AS revenue
    FROM payments
    ${whereSql}
    GROUP BY bucket
    ORDER BY bucket
  `).bind(...binds).all();

  // Payment method breakdown (lifetime).
  const byMethod = await c.env.DB.prepare(`
    SELECT COALESCE(NULLIF(method, ''), 'unknown') AS method,
           COUNT(*) AS count,
           COALESCE(SUM(amount), 0) AS revenue
    FROM payments
    WHERE status = 'paid'
    GROUP BY method
    ORDER BY revenue DESC
  `).all();

  // Coupon usage breakdown (lifetime).
  const byCoupon = await c.env.DB.prepare(`
    SELECT COALESCE(NULLIF(coupon_code, ''), '(no coupon)') AS coupon,
           COUNT(*) AS count,
           COALESCE(SUM(amount), 0) AS revenue
    FROM payments
    WHERE status = 'paid'
    GROUP BY coupon
    ORDER BY revenue DESC
    LIMIT 20
  `).all();

  // Revenue per cohort (program run), lifetime. The durable per-run history -
  // a cohort is a fixed time window so its total stays meaningful even as new
  // runs open.
  const byCohort = await c.env.DB.prepare(`
    SELECT r.cohort_key                                          AS cohort_key,
           COALESCE(c.label, r.cohort_key, '(unassigned)')       AS label,
           c.program_slug                                        AS program_slug,
           COUNT(*)                                              AS count,
           COALESCE(SUM(p.amount), 0)                            AS revenue
    FROM payments p
    JOIN registrations r ON r.id = p.registration_id
    LEFT JOIN cohorts c  ON c.cohort_key = r.cohort_key
    WHERE p.status = 'paid'
    GROUP BY r.cohort_key
    ORDER BY revenue DESC
    LIMIT 50
  `).all();

  return c.json({
    ok: true,
    period, from, to,
    buckets: (buckets.results || []).map((r) => ({
      bucket: r.bucket, count: Number(r.count), revenue: Number(r.revenue),
    })),
    byMethod: (byMethod.results || []).map((r) => ({
      method: r.method, count: Number(r.count), revenue: Number(r.revenue),
    })),
    byCoupon: (byCoupon.results || []).map((r) => ({
      coupon: r.coupon, count: Number(r.count), revenue: Number(r.revenue),
    })),
    byCohort: (byCohort.results || []).map((r) => ({
      cohortKey: r.cohort_key, label: r.label, programSlug: r.program_slug,
      count: Number(r.count), revenue: Number(r.revenue),
    })),
  });
});

// ─── Sponsorships ────────────────────────────────────────────────────────────
//
// GET /api/admin/sponsorships
// Query params: status (new|contacted|closed), limit
admin.get("/sponsorships", async (c) => {
  const status = c.req.query("status");
  const limit  = Math.min(Number(c.req.query("limit")) || 200, 1000);

  const wheres = [];
  const binds  = [];
  if (status) { wheres.push("status = ?"); binds.push(status); }
  const whereSql = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";

  const rows = await c.env.DB.prepare(
    `SELECT * FROM sponsorship_enquiries ${whereSql} ORDER BY created_at DESC LIMIT ?`
  ).bind(...binds, limit).all();

  const summary = await c.env.DB.prepare(`
    SELECT
      COUNT(*)                                              AS total,
      SUM(CASE WHEN status = 'new'       THEN 1 ELSE 0 END) AS unread,
      SUM(CASE WHEN status = 'contacted' THEN 1 ELSE 0 END) AS contacted,
      SUM(CASE WHEN status = 'closed'    THEN 1 ELSE 0 END) AS closed
    FROM sponsorship_enquiries
  `).first();

  return c.json({
    ok: true,
    rows: rows.results,
    summary: {
      total:     Number(summary?.total)     || 0,
      unread:    Number(summary?.unread)    || 0,
      contacted: Number(summary?.contacted) || 0,
      closed:    Number(summary?.closed)    || 0,
    },
    filter: { status: status || null, limit },
  });
});

// PATCH /api/admin/sponsorships/:id/status
admin.patch("/sponsorships/:id/status", async (c) => {
  const id = c.req.param("id");
  const { status } = await c.req.json();
  const allowed = ["new", "contacted", "closed"];
  if (!allowed.includes(status)) {
    return c.json({ error: `Invalid status. Allowed: ${allowed.join(", ")}` }, 400);
  }

  const before = await c.env.DB.prepare(
    "SELECT id, status FROM sponsorship_enquiries WHERE id = ? LIMIT 1"
  ).bind(id).first();
  if (!before) return c.json({ error: "Sponsorship enquiry not found." }, 404);

  await c.env.DB.prepare("UPDATE sponsorship_enquiries SET status = ? WHERE id = ?").bind(status, id).run();

  const session = c.get("session");
  await recordAudit(c.env, session.account_id, "sponsorship.update_status", {
    type: "sponsorship",
    id,
    payload: { from: before.status, to: status },
  });

  return c.json({ ok: true, id, status });
});

// ─── Users (accounts) ────────────────────────────────────────────────────────
//
// All accounts (guardians + staff) live in guardian_accounts.role.
// Admins can list everyone and bump a role. Never expose password hashes.
//
// GET /api/admin/users
// Query params: role (filter), q (substring on email|full_name|member_id),
//               limit (default 200)
admin.get("/users", async (c) => {
  const role  = c.req.query("role");
  const q     = c.req.query("q");
  const limit = Math.min(Number(c.req.query("limit")) || 200, 1000);

  const wheres = [];
  const binds  = [];
  if (role) { wheres.push("role = ?"); binds.push(role); }
  if (q) {
    wheres.push("(email LIKE ? OR full_name LIKE ? OR IFNULL(member_id, '') LIKE ?)");
    const like = `%${q}%`;
    binds.push(like, like, like);
  }
  const whereSql = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";

  const rows = await c.env.DB.prepare(`
    SELECT
      a.id, a.email, a.full_name, a.phone, a.email_verified, a.member_id,
      a.role, a.created_at,
      (SELECT COUNT(*) FROM registrations r WHERE r.guardian_account_id = a.id)
        AS registration_count
    FROM guardian_accounts a
    ${whereSql}
    ORDER BY a.created_at DESC
    LIMIT ?
  `).bind(...binds, limit).all();

  const summary = await c.env.DB.prepare(`
    SELECT
      COUNT(*)                                                AS total,
      SUM(CASE WHEN role = 'admin'    THEN 1 ELSE 0 END)      AS admins,
      SUM(CASE WHEN role = 'editor'   THEN 1 ELSE 0 END)      AS editors,
      SUM(CASE WHEN role = 'guardian' THEN 1 ELSE 0 END)      AS guardians,
      SUM(CASE WHEN email_verified = 1 THEN 1 ELSE 0 END)     AS verified
    FROM guardian_accounts
  `).first();

  return c.json({
    ok: true,
    rows: rows.results,
    summary: {
      total:     Number(summary?.total)     || 0,
      admins:    Number(summary?.admins)    || 0,
      editors:   Number(summary?.editors)   || 0,
      guardians: Number(summary?.guardians) || 0,
      verified:  Number(summary?.verified)  || 0,
    },
    filter: { role: role || null, q: q || null, limit },
  });
});

// PATCH /api/admin/users/:id/role
// Body: { role: 'guardian' | 'admin' | 'editor' | 'mentor' }
// Guardrails:
//   * Admins cannot demote themselves (avoid locking themselves out).
//   * Demoting the LAST admin is rejected.
admin.patch("/users/:id/role", async (c) => {
  const id = c.req.param("id");
  const { role } = await c.req.json();
  const allowed = ["guardian", "admin", "editor", "mentor"];
  if (!allowed.includes(role)) {
    return c.json({ error: `Invalid role. Allowed: ${allowed.join(", ")}` }, 400);
  }

  const session = c.get("session");
  if (id === session.account_id && role !== "admin") {
    return c.json({ error: "You cannot remove your own admin role." }, 400);
  }

  const before = await c.env.DB.prepare(
    "SELECT id, role FROM guardian_accounts WHERE id = ? LIMIT 1"
  ).bind(id).first();
  if (!before) return c.json({ error: "User not found." }, 404);

  // Block demoting the last admin in the system.
  if (before.role === "admin" && role !== "admin") {
    const remaining = await c.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM guardian_accounts WHERE role = 'admin' AND id != ?"
    ).bind(id).first();
    if (!Number(remaining?.n)) {
      return c.json({ error: "Refusing to demote the last admin." }, 400);
    }
  }

  await c.env.DB.prepare("UPDATE guardian_accounts SET role = ? WHERE id = ?").bind(role, id).run();

  await recordAudit(c.env, session.account_id, "user.update_role", {
    type: "user",
    id,
    payload: { from: before.role, to: role },
  });

  return c.json({ ok: true, id, role });
});

// PATCH /api/admin/users/:id
// Whitelist-update a guardian account's contact fields. Email must stay unique
// across accounts. Only the fields present in the body are touched.
admin.patch("/users/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const allowed = ["full_name", "phone", "email"];
  const sets = [];
  const binds = [];
  for (const field of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      sets.push(`${field} = ?`);
      binds.push(body[field]);
    }
  }
  if (!sets.length) return c.json({ error: "No updatable fields provided." }, 400);

  const before = await c.env.DB.prepare(
    "SELECT id FROM guardian_accounts WHERE id = ? LIMIT 1"
  ).bind(id).first();
  if (!before) return c.json({ error: "User not found." }, 404);

  if (Object.prototype.hasOwnProperty.call(body, "email")) {
    const clash = await c.env.DB.prepare(
      "SELECT id FROM guardian_accounts WHERE email = ? AND id != ? LIMIT 1"
    ).bind(body.email, id).first();
    if (clash) return c.json({ error: "That email is already in use by another account." }, 409);
  }

  binds.push(id);
  await c.env.DB.prepare(
    `UPDATE guardian_accounts SET ${sets.join(", ")} WHERE id = ?`
  ).bind(...binds).run();

  const session = c.get("session");
  await recordAudit(c.env, session.account_id, "user.update_fields", {
    type: "user", id, payload: { fields: sets.map((s) => s.split(" = ")[0]) },
  });
  return c.json({ ok: true, id });
});

// ─── Coupons ─────────────────────────────────────────────────────────────────
//
// Coupons are how we hand out partner / scholarship discounts. The
// public /api/validate-coupon endpoint reads from this table; here we
// give admins list / create / update / delete.
//
// Codes are stored verbatim (upper-cased on write) so the public
// validator can compare case-insensitively without indexing trickery.

const COUPON_UPDATE_FIELDS = ["discount_type", "discount_value", "max_uses", "applies_to", "expires_at"];

admin.get("/coupons", async (c) => {
  const q     = c.req.query("q");
  const limit = Math.min(Number(c.req.query("limit")) || 200, 1000);

  const wheres = [];
  const binds  = [];
  if (q) {
    wheres.push("(code LIKE ? OR IFNULL(applies_to, '') LIKE ?)");
    const like = `%${q.toUpperCase()}%`;
    binds.push(like, like);
  }
  const whereSql = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";

  const rows = await c.env.DB.prepare(`
    SELECT code, discount_type, discount_value, max_uses, used_count,
           applies_to, expires_at, created_at
    FROM coupons
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(...binds, limit).all();

  const now = new Date().toISOString();
  const summary = await c.env.DB.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN expires_at IS NULL OR expires_at > ? THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN expires_at IS NOT NULL AND expires_at <= ? THEN 1 ELSE 0 END) AS expired,
      SUM(CASE WHEN max_uses IS NOT NULL AND used_count >= max_uses THEN 1 ELSE 0 END) AS exhausted,
      COALESCE(SUM(used_count), 0) AS total_redemptions
    FROM coupons
  `).bind(now, now).first();

  return c.json({
    ok: true,
    rows: rows.results,
    summary: {
      total:             Number(summary?.total)             || 0,
      active:            Number(summary?.active)            || 0,
      expired:           Number(summary?.expired)           || 0,
      exhausted:         Number(summary?.exhausted)         || 0,
      total_redemptions: Number(summary?.total_redemptions) || 0,
    },
    filter: { q: q || null, limit },
  });
});

admin.post("/coupons", async (c) => {
  const body = await c.req.json();
  const code = (body.code || "").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code)) {
    return c.json({ error: "Code must be 3–32 chars: A–Z, 0–9, _ or -; can't start with _ or -." }, 400);
  }
  const type  = body.discount_type === "fixed" ? "fixed" : "percent";
  const value = Number(body.discount_value);
  if (!Number.isFinite(value) || value <= 0) {
    return c.json({ error: "discount_value must be a positive number." }, 400);
  }
  if (type === "percent" && value > 100) {
    return c.json({ error: "Percent discount can't exceed 100." }, 400);
  }
  const maxUses = body.max_uses == null || body.max_uses === ""
    ? null : Math.max(0, Math.floor(Number(body.max_uses)));

  const existing = await c.env.DB.prepare("SELECT code FROM coupons WHERE code = ?").bind(code).first();
  if (existing) return c.json({ error: `Coupon "${code}" already exists.` }, 409);

  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    INSERT INTO coupons (code, discount_type, discount_value, max_uses, used_count,
                         applies_to, expires_at, created_at)
    VALUES (?, ?, ?, ?, 0, ?, ?, ?)
  `).bind(
    code, type, value, maxUses,
    body.applies_to || null,
    body.expires_at || null,
    now,
  ).run();

  const session = c.get("session");
  await recordAudit(c.env, session.account_id, "coupon.create", {
    type: "coupon", id: code, payload: { discount_type: type, discount_value: value, max_uses: maxUses },
  });

  return c.json({ ok: true, code });
});

admin.patch("/coupons/:code", async (c) => {
  const code = c.req.param("code").toUpperCase();
  const body = await c.req.json();

  const before = await c.env.DB.prepare("SELECT * FROM coupons WHERE code = ? LIMIT 1").bind(code).first();
  if (!before) return c.json({ error: "Coupon not found." }, 404);

  const sets  = [];
  const binds = [];
  if (body.expire) {
    sets.push("expires_at = ?");
    binds.push(new Date().toISOString());
  }
  for (const f of COUPON_UPDATE_FIELDS) {
    if (!(f in body)) continue;
    let value = body[f];
    if (f === "discount_value") {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) return c.json({ error: "discount_value must be positive." }, 400);
      const type = body.discount_type || before.discount_type;
      if (type === "percent" && n > 100) return c.json({ error: "Percent discount can't exceed 100." }, 400);
      value = n;
    }
    if (f === "max_uses") {
      value = value == null || value === "" ? null : Math.max(0, Math.floor(Number(value)));
    }
    if ((f === "applies_to" || f === "expires_at") && value === "") value = null;
    sets.push(`${f} = ?`);
    binds.push(value);
  }
  if (!sets.length) return c.json({ error: "Nothing to update." }, 400);

  await c.env.DB.prepare(`UPDATE coupons SET ${sets.join(", ")} WHERE code = ?`).bind(...binds, code).run();

  const session = c.get("session");
  await recordAudit(c.env, session.account_id, "coupon.update", {
    type: "coupon", id: code,
    payload: { fields: Object.keys(body).filter((k) => COUPON_UPDATE_FIELDS.includes(k)) },
  });

  return c.json({ ok: true, code });
});

admin.delete("/coupons/:code", async (c) => {
  const code = c.req.param("code").toUpperCase();
  const before = await c.env.DB.prepare("SELECT code, used_count FROM coupons WHERE code = ?").bind(code).first();
  if (!before) return c.json({ error: "Coupon not found." }, 404);

  // Refuse to hard-delete coupons that have been used - referenced by
  // payments.coupon_code; deleting would orphan that history. Expire
  // instead by setting expires_at in the past.
  if (Number(before.used_count) > 0) {
    return c.json({
      error: `Coupon "${code}" has been used ${before.used_count} time(s). Expire it instead of deleting.`,
    }, 409);
  }

  await c.env.DB.prepare("DELETE FROM coupons WHERE code = ?").bind(code).run();

  const session = c.get("session");
  await recordAudit(c.env, session.account_id, "coupon.delete", {
    type: "coupon", id: code, payload: {},
  });

  return c.json({ ok: true, code });
});

// ─── Uploads (R2) ────────────────────────────────────────────────────────────
//
// POST /api/admin/uploads  (multipart/form-data)
//   file:   the image File (jpeg | png | webp | gif | svg)
//   prefix: optional folder ("posts" | "programs" | ...). Defaults to "misc".
//
// The image is committed into the repo at apps/static/src/assets/uploads/<key>
// (the single source Astro optimizes on the next build) - dev writes the working
// tree via the asset sidecar, prod commits via the GitHub API. Returns
// { url, key, size, type }; `url` is `/assets/uploads/<key>`, which the <Img>
// component resolves to the optimized asset and the admin previews via
// /admin-img. See worker/lib/repoAssets.js. (No R2.)

// NB: image/svg+xml is intentionally excluded. SVGs are served raw from our
// own origin (/admin-img, /assets/uploads) and an SVG can carry inline
// <script>, so allowing uploads would be a stored-XSS vector. Raster only.
const ALLOWED_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png":  "png",
  "image/webp": "webp",
  "image/gif":  "gif",
};
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;   // 10 MB - cover-image sized.

admin.post("/uploads", async (c) => {
  const form = await c.req.parseBody();
  const file = form.file;
  if (!file || typeof file === "string") {
    return c.json({ error: "Missing 'file' field." }, 400);
  }
  const ext = ALLOWED_IMAGE_TYPES[file.type];
  if (!ext) {
    return c.json({
      error: `Unsupported type ${file.type || "unknown"}. Allowed: ${Object.keys(ALLOWED_IMAGE_TYPES).join(", ")}.`,
    }, 415);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return c.json({ error: `File too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).` }, 413);
  }

  // Sanitise the prefix to a single safe path segment.
  const rawPrefix = (form.prefix || "misc").toString().toLowerCase();
  const prefix = /^[a-z0-9][a-z0-9-]{0,30}$/.test(rawPrefix) ? rawPrefix : "misc";

  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const key = `${prefix}/${yyyy}/${mm}/${id}.${ext}`;
  const repoRel = `apps/static/src/assets/uploads/${key}`;

  try {
    const buf = await file.arrayBuffer();
    await writeRepoAsset(c.env, repoRel, buf, file.type, `chore(upload): ${key}`);
  } catch (err) {
    console.error("upload failed:", err && err.message ? err.message : err);
    return c.json({ error: "Upload failed - asset storage not configured or unreachable." }, 502);
  }

  const session = c.get("session");
  await recordAudit(c.env, session.account_id, "upload.create", {
    type: "upload", id: key, payload: { size: file.size, type: file.type },
  });

  return c.json({
    ok: true,
    url:  `/assets/uploads/${key}`,
    key,
    size: file.size,
    type: file.type,
  });
});

// ─── Audit log ───────────────────────────────────────────────────────────────
//
// GET /api/admin/audit
// Query params: limit (default 200), action (substring filter),
//               target_type, target_id, account_id
// Joined to guardian_accounts so the UI can render the actor's email
// without a second round-trip.
admin.get("/audit", async (c) => {
  const limit       = Math.min(Number(c.req.query("limit")) || 200, 1000);
  const action      = c.req.query("action");
  const targetType  = c.req.query("target_type");
  const targetId    = c.req.query("target_id");
  const accountId   = c.req.query("account_id");
  const actorEmail  = c.req.query("actor");
  const from        = c.req.query("from");
  const to          = c.req.query("to");

  const wheres = [];
  const binds  = [];
  if (action)     { wheres.push("l.action LIKE ?");    binds.push(`%${action}%`); }
  if (targetType) { wheres.push("l.target_type = ?");  binds.push(targetType); }
  if (targetId)   { wheres.push("l.target_id = ?");    binds.push(targetId); }
  if (accountId)  { wheres.push("l.account_id = ?");   binds.push(accountId); }
  if (actorEmail) { wheres.push("a.email LIKE ?");     binds.push(`%${actorEmail}%`); }
  if (from)       { wheres.push("date(l.created_at) >= ?"); binds.push(from); }
  if (to)         { wheres.push("date(l.created_at) <= ?"); binds.push(to); }
  const whereSql = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";

  const [rows, distinctActions, distinctActors] = await Promise.all([
    c.env.DB.prepare(`
      SELECT
        l.id, l.account_id, l.action, l.target_type, l.target_id,
        l.payload_json, l.created_at,
        a.email AS account_email
      FROM admin_audit_log l
      LEFT JOIN guardian_accounts a ON a.id = l.account_id
      ${whereSql}
      ORDER BY l.created_at DESC
      LIMIT ?
    `).bind(...binds, limit).all(),
    c.env.DB.prepare("SELECT DISTINCT action FROM admin_audit_log ORDER BY action").all(),
    c.env.DB.prepare(`
      SELECT DISTINCT a.email
      FROM admin_audit_log l JOIN guardian_accounts a ON a.id = l.account_id
      WHERE a.email IS NOT NULL ORDER BY a.email LIMIT 50
    `).all(),
  ]);

  return c.json({
    ok: true,
    rows: rows.results,
    facets: {
      actions: (distinctActions.results || []).map((r) => r.action),
      actors:  (distinctActors.results  || []).map((r) => r.email),
    },
    filter: {
      action:      action     || null,
      target_type: targetType || null,
      target_id:   targetId   || null,
      account_id:  accountId  || null,
      actor:       actorEmail || null,
      from:        from       || null,
      to:          to         || null,
      limit,
    },
  });
});

// ─── Analytics ───────────────────────────────────────────────────────────────
//
// GET /api/admin/analytics
// Aggregate breakdowns for the dashboard overview: the submitted->paid
// funnel, registrations per exam venue, and registrations per program.
admin.get("/analytics", async (c) => {
  const hit = await cacheGet("analytics"); if (hit) return cacheHit(hit);
  const catalog = await getCatalog(c);
  // All eight aggregates run in parallel - D1 latency dominates, so
  // sequential awaits would compound badly.
  const [
    funnel, byVenue, byProgram, revenue, cashCollected, deltas, regSeries, paySeries, attention, expiringCoupons,
  ] = await Promise.all([
    c.env.DB.prepare(`
      SELECT
        COUNT(*)                                                AS total,
        SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END)   AS submitted,
        SUM(CASE WHEN status = 'paid'      THEN 1 ELSE 0 END)   AS paid,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)   AS cancelled
      FROM registrations
      WHERE cohort_key IN (SELECT cohort_key FROM cohorts WHERE ${cohortStageSQL("")} IN ('enrolling', 'upcoming', 'running'))
    `).first(),
    c.env.DB.prepare(`
      SELECT COALESCE(NULLIF(TRIM(r.preferred_venue), ''), 'Not set')         AS venue,
             COUNT(DISTINCT r.id)                                             AS total,
             COUNT(DISTINCT CASE WHEN r.status = 'paid' THEN r.id END)        AS paid,
             COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0) AS revenue
      FROM registrations r
      LEFT JOIN payments p ON p.registration_id = r.id
      WHERE r.cohort_key IN (SELECT cohort_key FROM cohorts WHERE ${cohortStageSQL("")} IN ('enrolling', 'upcoming', 'running'))
      GROUP BY venue
      ORDER BY total DESC
    `).all(),
    // Lifetime, grouped by program - same definition as GET /reports so the
    // dashboard's by-program block and the Reports page never disagree. "Paid"
    // = registrations with a real money payment (free ৳0 grants excluded).
    c.env.DB.prepare(`
      SELECT r.registration_type AS program_slug,
             COUNT(DISTINCT r.id)                                                       AS total,
             COUNT(DISTINCT CASE WHEN p.status = 'paid' AND p.amount > 0 THEN r.id END) AS paid,
             COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0)     AS revenue
      FROM registrations r
      LEFT JOIN payments p ON p.registration_id = r.id
      GROUP BY r.registration_type
      ORDER BY total DESC
    `).all(),
    // Lifetime gateway (online) collection - the shurjoPay KPI tile. Lifetime,
    // not active-runs: the top tiles are all-time; the by-program block below is
    // the cohort-scoped view.
    c.env.DB.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM payments WHERE status = 'paid' AND channel = 'online'
    `).first(),
    // Lifetime cash / manual collection - the Cash KPI tile.
    c.env.DB.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM payments WHERE status = 'paid' AND channel = 'manual'
    `).first(),
    // Today vs yesterday deltas (registrations + paid + revenue). Predicates are
    // sargable (raw column vs ISO day bounds) so the created_at/updated_at indexes
    // apply; same UTC-day semantics as date(col)=date('now').
    c.env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM registrations WHERE created_at >= date('now') AND created_at < date('now','+1 day'))                                  AS reg_today,
        (SELECT COUNT(*) FROM registrations WHERE created_at >= date('now','-1 day') AND created_at < date('now'))                                   AS reg_yesterday,
        (SELECT COUNT(*) FROM registrations WHERE status='paid' AND created_at >= date('now') AND created_at < date('now','+1 day'))                 AS paid_today,
        (SELECT COUNT(*) FROM registrations WHERE status='paid' AND created_at >= date('now','-1 day') AND created_at < date('now'))                 AS paid_yesterday,
        (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='paid' AND updated_at >= date('now') AND updated_at < date('now','+1 day'))       AS rev_today,
        (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='paid' AND updated_at >= date('now','-1 day') AND updated_at < date('now'))       AS rev_yesterday,
        (SELECT COUNT(*) FROM registrations WHERE status='submitted' AND created_at >= date('now') AND created_at < date('now','+1 day'))            AS pending_today,
        (SELECT COUNT(*) FROM registrations WHERE status='submitted' AND created_at >= date('now','-1 day') AND created_at < date('now'))            AS pending_yesterday
    `).first(),
    // Registrations per day, last 30 days. Client fills missing days with 0.
    c.env.DB.prepare(`
      SELECT date(created_at) AS day,
             COUNT(*)                                          AS total,
             SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END)    AS paid
      FROM registrations
      WHERE created_at >= date('now', '-29 days')
      GROUP BY day
      ORDER BY day
    `).all(),
    // Revenue per day, last 30 days.
    c.env.DB.prepare(`
      SELECT date(updated_at) AS day,
             COUNT(*)                            AS count,
             COALESCE(SUM(amount), 0)            AS revenue
      FROM payments
      WHERE status='paid' AND updated_at >= date('now', '-29 days')
      GROUP BY day
      ORDER BY day
    `).all(),
    // Needs-attention counters (single row, four metrics).
    c.env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM registrations
         WHERE status='submitted' AND created_at < datetime('now', '-3 days'))                  AS stuck_unpaid,
        (SELECT COUNT(*) FROM payments
         WHERE status='failed' AND updated_at >= datetime('now', '-7 days'))                    AS recent_failed,
        (SELECT COUNT(*) FROM sponsorship_enquiries WHERE status='new')                         AS unread_sponsorships,
        (SELECT COUNT(*) FROM coupons
         WHERE expires_at IS NOT NULL
           AND date(expires_at) >= date('now')
           AND date(expires_at) <= date('now', '+7 days')
           AND (max_uses IS NULL OR used_count < max_uses))                                     AS expiring_coupons
    `).first(),
    // The full list of expiring-soon coupons (top 5) so the widget can
    // link straight to the offending code.
    c.env.DB.prepare(`
      SELECT code, expires_at, used_count, max_uses
      FROM coupons
      WHERE expires_at IS NOT NULL
        AND date(expires_at) >= date('now')
        AND date(expires_at) <= date('now', '+7 days')
        AND (max_uses IS NULL OR used_count < max_uses)
      ORDER BY expires_at
      LIMIT 5
    `).all(),
  ]);

  return cachePut(c, "analytics", 60, {
    ok: true,
    funnel: {
      total:     Number(funnel?.total)     || 0,
      submitted: Number(funnel?.submitted) || 0,
      paid:      Number(funnel?.paid)      || 0,
      cancelled: Number(funnel?.cancelled) || 0,
    },
    byVenue: (byVenue.results || []).map((r) => ({
      venue: r.venue, total: Number(r.total), paid: Number(r.paid), revenue: Number(r.revenue) || 0,
    })),
    byProgram: (byProgram.results || []).map((r) => ({
      type:    r.program_slug,
      program_label: catalog.nameFor(r.program_slug),
      cohort:  r.program_slug,                 // group key (lifetime: one row per program)
      label:   catalog.nameFor(r.program_slug),
      total:   Number(r.total),
      paid:    Number(r.paid),
      revenue: Number(r.revenue) || 0,
    })),
    revenue: Number(revenue?.total) || 0,
    cashCollected: Number(cashCollected?.total) || 0,
    deltas: {
      reg_today:       Number(deltas?.reg_today)       || 0,
      reg_yesterday:   Number(deltas?.reg_yesterday)   || 0,
      paid_today:      Number(deltas?.paid_today)      || 0,
      paid_yesterday:  Number(deltas?.paid_yesterday)  || 0,
      rev_today:       Number(deltas?.rev_today)       || 0,
      rev_yesterday:   Number(deltas?.rev_yesterday)   || 0,
      pending_today:   Number(deltas?.pending_today)   || 0,
      pending_yesterday: Number(deltas?.pending_yesterday) || 0,
    },
    series: {
      registrations: (regSeries.results || []).map((r) => ({
        day: r.day, total: Number(r.total), paid: Number(r.paid),
      })),
      payments: (paySeries.results || []).map((r) => ({
        day: r.day, count: Number(r.count), revenue: Number(r.revenue),
      })),
    },
    attention: {
      stuck_unpaid:        Number(attention?.stuck_unpaid)        || 0,
      recent_failed:       Number(attention?.recent_failed)       || 0,
      unread_sponsorships: Number(attention?.unread_sponsorships) || 0,
      expiring_coupons:    Number(attention?.expiring_coupons)    || 0,
      expiring_list: (expiringCoupons.results || []).map((r) => ({
        code: r.code, expires_at: r.expires_at,
        used_count: Number(r.used_count), max_uses: r.max_uses == null ? null : Number(r.max_uses),
      })),
    },
  });
});

// ─── Broadcast ───────────────────────────────────────────────────────────────
//
// Email registered guardians an announcement, filtered by program / exam
// venue / registration status. Recipients are the DISTINCT current account
// emails behind matching registrations.
function broadcastFilters(src) {
  const wheres = ["a.email IS NOT NULL", "a.email != ''"];
  const binds  = [];
  if (src.program) { wheres.push("r.registration_type = ?"); binds.push(src.program); }
  if (src.venue)   { wheres.push("r.preferred_venue = ?");   binds.push(src.venue); }
  if (src.status)  { wheres.push("r.status = ?");            binds.push(src.status); }
  return { whereSql: `WHERE ${wheres.join(" AND ")}`, binds };
}

// Resolve the DISTINCT recipient-email query for a broadcast audience. The
// 'unpaid' audience targets everyone who has NOT paid for the program - unpaid
// registrants AND guardians who never enrolled in it (account-based; venue does
// not apply). Other statuses filter matching registrations as before.
function broadcastRecipientSql(src) {
  if (src.status === "unpaid") {
    const binds = [];
    // Exclude anyone with a SUCCESSFUL payment for the program - even if they
    // also have failed/pending attempts. Keyed on the payment, not reg status.
    let paidSub = "SELECT r.guardian_account_id FROM registrations r JOIN payments p ON p.registration_id = r.id AND p.status = 'paid'";
    if (src.program) { paidSub += " WHERE r.registration_type = ?"; binds.push(src.program); }
    return {
      sql: `SELECT DISTINCT a.email FROM guardian_accounts a WHERE a.email IS NOT NULL AND a.email != '' AND a.id NOT IN (${paidSub})`,
      binds,
    };
  }
  const { whereSql, binds } = broadcastFilters(src);
  return {
    sql: `SELECT DISTINCT a.email FROM registrations r JOIN guardian_accounts a ON a.id = r.guardian_account_id ${whereSql}`,
    binds,
  };
}

// GET /api/admin/reports?cohort=<key>
// Lifetime business totals + per-program + per-region breakdowns. No cohort =
// everything (all-time); a cohort key scopes every figure to that one run.
// Unlike /analytics (operational, active-runs scoped), this is the true ledger:
// totals reconcile exactly to SUM(paid payments), and only programs that
// actually have registrations appear (no empty rows).
admin.get("/reports", async (c) => {
  const cohort = (c.req.query("cohort") || "").trim();
  const ckey = `reports:${cohort || "all"}`;
  const hit = await cacheGet(ckey); if (hit) return cacheHit(hit);
  const catalog = await getCatalog(c);
  const where = cohort ? "WHERE r.cohort_key = ?" : "";
  const bind = cohort ? [cohort] : [];
  // "Paid" counts registrations with a real money payment (amount > 0), so free
  // ৳0 grants (e.g. prep students' complimentary mock test) are NOT counted as
  // paid - they still appear in the total participant count.
  const agg = (groupExpr, nameAs) => `
    SELECT ${groupExpr} AS ${nameAs},
           COUNT(DISTINCT r.id)                                                       AS total,
           COUNT(DISTINCT CASE WHEN p.status = 'paid' AND p.amount > 0 THEN r.id END) AS paid,
           COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0)     AS revenue
    FROM registrations r
    LEFT JOIN payments p ON p.registration_id = r.id
    ${where}
    GROUP BY ${nameAs}
    ORDER BY total DESC`;
  const [totals, byProgram, byVenue, acq] = await Promise.all([
    c.env.DB.prepare(`
      SELECT COUNT(DISTINCT r.id) AS total,
             COUNT(DISTINCT CASE WHEN p.status = 'paid' AND p.amount > 0 THEN r.id END) AS paid,
             COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0) AS revenue
      FROM registrations r LEFT JOIN payments p ON p.registration_id = r.id ${where}
    `).bind(...bind).first(),
    c.env.DB.prepare(agg("r.registration_type", "type")).bind(...bind).all(),
    c.env.DB.prepare(agg("COALESCE(NULLIF(TRIM(r.preferred_venue), ''), 'Not set')", "venue")).bind(...bind).all(),
    // Acquisition split, same cohort scope. "Paid ads" = utm_medium='paid' (tag
    // the ad link URLs). "FB/IG organic" = an fbclid click that isn't paid-tagged
    // (organic posts, shares, or paid ads not yet utm-tagged). 'paid' counts =
    // real money (amount > 0), matching the other report figures.
    c.env.DB.prepare(`
      SELECT
        COUNT(DISTINCT CASE WHEN json_extract(r.attribution,'$.utm_medium')='paid' THEN r.id END) AS ad_total,
        COUNT(DISTINCT CASE WHEN json_extract(r.attribution,'$.utm_medium')='paid' AND p.status='paid' AND p.amount>0 THEN r.id END) AS ad_paid,
        COUNT(DISTINCT CASE WHEN json_extract(r.attribution,'$.fbclid') IS NOT NULL AND COALESCE(json_extract(r.attribution,'$.utm_medium'),'')<>'paid' THEN r.id END) AS org_total,
        COUNT(DISTINCT CASE WHEN json_extract(r.attribution,'$.fbclid') IS NOT NULL AND COALESCE(json_extract(r.attribution,'$.utm_medium'),'')<>'paid' AND p.status='paid' AND p.amount>0 THEN r.id END) AS org_paid
      FROM registrations r LEFT JOIN payments p ON p.registration_id = r.id ${where}
    `).bind(...bind).first(),
  ]);
  return cachePut(c, ckey, 60, {
    totals: {
      participants: Number(totals?.total) || 0,
      paid: Number(totals?.paid) || 0,
      revenue: Number(totals?.revenue) || 0,
      adPaid: Number(acq?.ad_total) || 0,
      adPaidPaid: Number(acq?.ad_paid) || 0,
      fbOrganic: Number(acq?.org_total) || 0,
      fbOrganicPaid: Number(acq?.org_paid) || 0,
    },
    byProgram: (byProgram.results || []).map((r) => ({
      name: catalog.nameFor(r.type), total: Number(r.total), paid: Number(r.paid), revenue: Number(r.revenue) || 0,
    })),
    byVenue: (byVenue.results || []).map((r) => ({
      name: r.venue, total: Number(r.total), paid: Number(r.paid), revenue: Number(r.revenue) || 0,
    })),
  });
});

// GET /api/admin/broadcast/recipients?program=&venue=&status=
// How many distinct guardians a broadcast with these filters would reach.
admin.get("/broadcast/recipients", async (c) => {
  const { sql, binds } = broadcastRecipientSql({
    program: c.req.query("program"),
    venue:   c.req.query("venue"),
    status:  c.req.query("status"),
  });
  const row = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM (${sql})`).bind(...binds).first();
  return c.json({ ok: true, count: Number(row?.n) || 0 });
});

// GET /api/admin/regions
// Sorted distinct non-empty registration venues, for broadcast targeting.
// (The venue filter elsewhere binds to registrations.preferred_venue.)
admin.get("/regions", async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT DISTINCT preferred_venue AS venue
    FROM registrations
    WHERE preferred_venue IS NOT NULL AND preferred_venue != ''
    ORDER BY preferred_venue
  `).all();
  return c.json({ regions: (rows.results || []).map((r) => r.venue) });
});

// POST /api/admin/broadcast  { subject, message, program?, venue?, status? }
admin.post("/broadcast", async (c) => {
  const body    = await c.req.json();
  const subject = (body.subject || "").trim();
  const message = (body.message || "").trim();
  if (!subject) return c.json({ error: "Subject is required." }, 400);
  if (!message) return c.json({ error: "Message is required." }, 400);

  const session = c.get("session");
  if (!(await checkActionRateLimit(c.env, "broadcast", session.account_id, 10, 60 * 60 * 1000))) {
    return c.json({ error: "Too many broadcasts. Wait an hour before sending again." }, 429);
  }
  await recordActionAttempt(c.env, "broadcast", session.account_id);

  // Optional attachments: [{ name, content (base64) }]. Brevo caps a single
  // email near 10 MB, so guard the decoded total before we ship it.
  const attachments = Array.isArray(body.attachments)
    ? body.attachments
        .filter((a) => a && typeof a.name === "string" && typeof a.content === "string" && a.content)
        .map((a) => ({ name: a.name.slice(0, 200), content: a.content }))
    : [];
  if (attachments.length > 20) {
    return c.json({ error: "Too many attachments (max 20)." }, 400);
  }
  const attachmentBytes = attachments.reduce((n, a) => n + Math.floor(a.content.length * 0.75), 0);
  if (attachmentBytes > 10 * 1024 * 1024) {
    return c.json({ error: "Attachments exceed 10 MB total." }, 400);
  }

  // Manual recipient list (body.emails) takes precedence over the audience
  // filters - lets an admin send to specific addresses directly.
  const manual = Array.isArray(body.emails)
    ? [...new Set(body.emails.map((e) => String(e).trim().toLowerCase()).filter(Boolean))]
    : [];
  let recipients;
  if (manual.length) {
    const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    const bad = manual.filter((e) => !emailRe.test(e));
    if (bad.length) return c.json({ error: `Invalid email address: ${bad[0]}` }, 400);
    recipients = manual;
  } else {
    const { sql, binds } = broadcastRecipientSql(body);
    const rows = await c.env.DB.prepare(sql).bind(...binds).all();
    recipients = (rows.results || []).map((r) => r.email).filter(Boolean);
  }
  if (recipients.length === 0) {
    return c.json({ error: "No recipients - add emails or widen the filters." }, 400);
  }

  const result = await sendBroadcastEmail(c.env, { subject, message, recipients, html: true, attachments });

  const filtersJson = manual.length
    ? JSON.stringify({ manual: recipients.length })
    : JSON.stringify({ program: body.program || null, venue: body.venue || null, status: body.status || null });

  // Persist to broadcast_log so the history tab can show past sends.
  // Best-effort: a log-write failure doesn't fail the send.
  try {
    await c.env.DB.prepare(`
      INSERT INTO broadcast_log (subject, body, filters_json, recipient_count, sent_count, failed_count, channel, sent_by)
      VALUES (?, ?, ?, ?, ?, ?, 'email', ?)
    `).bind(subject, message, filtersJson, recipients.length, result.sent, result.failed, session.account_id).run();
  } catch (err) { console.error("[admin.broadcast] log insert failed:", err?.message || err); }

  await recordAudit(c.env, session.account_id, "broadcast.send", {
    type: "broadcast",
    id: null,
    payload: {
      subject,
      recipients: recipients.length,
      sent: result.sent,
      failed: result.failed,
      filters: { program: body.program || null, venue: body.venue || null, status: body.status || null },
    },
  });

  return c.json({ ok: true, recipients: recipients.length, sent: result.sent, failed: result.failed });
});

// ─── Registration notes ──────────────────────────────────────────────────
// Append-only internal thread per registration. Surfaced inline in the
// registrations list as a count badge + expanded in the detail drawer.

admin.get("/registrations/:id/notes", async (c) => {
  const id = c.req.param("id");
  const rows = await c.env.DB.prepare(`
    SELECT n.id, n.body, n.created_at,
           n.author_account_id        AS author_id,
           a.email                    AS author_email,
           a.full_name                AS author_name
    FROM registration_notes n
    LEFT JOIN guardian_accounts a ON a.id = n.author_account_id
    WHERE n.registration_id = ?
    ORDER BY n.created_at DESC
    LIMIT 200
  `).bind(id).all();
  return c.json({ ok: true, rows: rows.results || [] });
});

admin.post("/registrations/:id/notes", async (c) => {
  const id   = c.req.param("id");
  const body = await c.req.json();
  const text = (body.body || "").trim();
  if (!text)          return c.json({ error: "Note body required." }, 400);
  if (text.length > 4000) return c.json({ error: "Note too long (4000 char max)." }, 413);

  const exists = await c.env.DB.prepare("SELECT 1 FROM registrations WHERE id = ?").bind(id).first();
  if (!exists) return c.json({ error: "Registration not found." }, 404);

  const session = c.get("session");
  const result = await c.env.DB.prepare(`
    INSERT INTO registration_notes (registration_id, author_account_id, body)
    VALUES (?, ?, ?)
  `).bind(id, session.account_id, text).run();

  return c.json({ ok: true, id: result.meta?.last_row_id });
});

admin.delete("/registrations/:id/notes/:noteId", async (c) => {
  const id     = c.req.param("id");
  const noteId = Number(c.req.param("noteId"));
  if (!Number.isInteger(noteId)) return c.json({ error: "Bad note id." }, 400);
  await c.env.DB.prepare("DELETE FROM registration_notes WHERE id = ? AND registration_id = ?").bind(noteId, id).run();
  return c.json({ ok: true });
});

// ─── Bulk actions on registrations ───────────────────────────────────────
// POST /api/admin/registrations/bulk/remind  { ids: [...] }
//   Sends a generic "complete your payment" email to each registration's
//   guardian. Skips anyone reminded in the last 24h (reminded_at) so a
//   guardian re-selected in the unpaid list day after day isn't re-mailed.
const REMIND_COOLDOWN = "-1 day";
admin.post("/registrations/bulk/remind", async (c) => {
  const body = await c.req.json();
  const ids  = Array.isArray(body.ids) ? body.ids.slice(0, 500) : [];
  if (ids.length === 0) return c.json({ error: "No registrations selected." }, 400);

  // Fetch guardian emails for each unpaid registration in the list that hasn't
  // been reminded within the cooldown window.
  const placeholders = ids.map(() => "?").join(",");
  // Bare column names (no alias) so the same filter is valid in both the
  // aliased SELECT below and the UPDATE further down (which has no alias).
  const remindFilter = `status = 'submitted' AND guardian_email IS NOT NULL AND guardian_email != ''
      AND (reminded_at IS NULL OR reminded_at < datetime('now', '${REMIND_COOLDOWN}'))`;
  const rows = await c.env.DB.prepare(`
    SELECT DISTINCT r.guardian_email AS email
    FROM registrations r
    WHERE r.id IN (${placeholders}) AND ${remindFilter}
  `).bind(...ids).all();
  const recipients = (rows.results || []).map((r) => r.email);
  if (recipients.length === 0) {
    return c.json({ error: "Nothing to remind: those registrations are already paid, or were reminded within the last 24 hours." }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const subject = "Reminder: complete your BdMSO registration payment";
  const message = `Hi,\n\nYou started registering for a BdMSO program but the payment isn't complete yet. To finish, please return to your dashboard and pay:\n\n${baseUrl}/dashboard\n\nIf you've already paid or no longer wish to participate, you can ignore this message.\n\nThanks,\nBdMSO Team`;

  const result = await sendBroadcastEmail(c.env, { subject, message, recipients });

  // Stamp reminded_at on exactly the rows we just reminded (same filter), so the
  // cooldown applies on the next bulk-remind.
  if (result.sent > 0) {
    await c.env.DB.prepare(
      `UPDATE registrations SET reminded_at = datetime('now') WHERE id IN (${placeholders}) AND ${remindFilter}`
    ).bind(...ids).run();
  }

  const session = c.get("session");
  await recordAudit(c.env, session.account_id, "registration.bulk_remind", {
    type: "registration", id: null,
    payload: { ids_count: ids.length, recipients: recipients.length, sent: result.sent, failed: result.failed },
  });

  return c.json({ ok: true, recipients: recipients.length, sent: result.sent, failed: result.failed });
});

// POST /api/admin/registrations/bulk/cancel  { ids: [...], reason? }
admin.post("/registrations/bulk/cancel", async (c) => {
  const body   = await c.req.json();
  const ids    = Array.isArray(body.ids) ? body.ids.slice(0, 500) : [];
  const reason = (body.reason || "").trim();
  if (ids.length === 0) return c.json({ error: "No registrations selected." }, 400);

  const placeholders = ids.map(() => "?").join(",");
  const result = await c.env.DB.prepare(`
    UPDATE registrations SET status = 'cancelled'
    WHERE id IN (${placeholders}) AND status = 'submitted'
  `).bind(...ids).run();

  const session = c.get("session");
  await recordAudit(c.env, session.account_id, "registration.bulk_cancel", {
    type: "registration", id: null,
    payload: { ids_count: ids.length, changes: result.meta?.changes || 0, reason: reason || null },
  });

  return c.json({ ok: true, cancelled: result.meta?.changes || 0 });
});

// ─── Triage queue ────────────────────────────────────────────────────────
//
// Builds a unified queue of items needing admin action: failed payments,
// stuck registrations, unread sponsorships, expiring coupons. Each item
// carries an admin-scoped `snoozed_until` so an item the current admin
// has snoozed disappears from their view until that time passes.

admin.get("/triage", async (c) => {
  const catalog = await getCatalog(c);
  const session = c.get("session");
  const adminId = session.account_id;

  const [failed, stuck, sponsors, coupons, snoozedRows] = await Promise.all([
    c.env.DB.prepare(`
      SELECT p.id, p.tran_id, p.amount, p.updated_at, p.registration_id,
             r.student_full_name, r.guardian_email
      FROM payments p
      LEFT JOIN registrations r ON r.id = p.registration_id
      WHERE p.status = 'failed' AND p.updated_at >= datetime('now', '-14 days')
      ORDER BY p.updated_at DESC
      LIMIT 50
    `).all(),
    c.env.DB.prepare(`
      SELECT r.id, r.student_full_name, r.guardian_email, r.created_at, r.registration_type
      FROM registrations r
      WHERE r.status = 'submitted' AND r.created_at < datetime('now', '-3 days')
      ORDER BY r.created_at ASC
      LIMIT 50
    `).all(),
    c.env.DB.prepare(`
      SELECT id, organization, email AS contact_email, phone AS contact_phone, message, created_at
      FROM sponsorship_enquiries
      WHERE status = 'new'
      ORDER BY created_at ASC
      LIMIT 50
    `).all(),
    c.env.DB.prepare(`
      SELECT code, expires_at, used_count, max_uses
      FROM coupons
      WHERE expires_at IS NOT NULL
        AND date(expires_at) >= date('now')
        AND date(expires_at) <= date('now', '+14 days')
        AND (max_uses IS NULL OR used_count < max_uses)
      ORDER BY expires_at ASC
      LIMIT 50
    `).all(),
    c.env.DB.prepare(`
      SELECT target_kind, target_id, snoozed_until
      FROM triage_state
      WHERE admin_account_id = ?
        AND (snoozed_until IS NULL OR snoozed_until > datetime('now'))
    `).bind(adminId).all(),
  ]);

  const snoozedSet = new Set(
    (snoozedRows.results || []).map((s) => `${s.target_kind}:${s.target_id}`)
  );

  const items = [];
  for (const r of failed.results || []) {
    const key = `failed_payment:${r.id}`;
    if (snoozedSet.has(key)) continue;
    items.push({
      kind: "failed_payment", id: String(r.id), urgency: "high",
      title: `Failed payment for ${r.student_full_name || "(unknown)"}`,
      detail: `Tran ${r.tran_id || "-"} · ${r.amount ?? "-"} BDT · ${r.guardian_email || ""}`,
      timestamp: r.updated_at,
      link: r.registration_id ? `/registrations/${r.registration_id}` : "/payments",
    });
  }
  for (const r of stuck.results || []) {
    const key = `stuck_reg:${r.id}`;
    if (snoozedSet.has(key)) continue;
    items.push({
      kind: "stuck_reg", id: r.id, urgency: "medium",
      title: `Stuck unpaid: ${r.student_full_name}`,
      detail: `${catalog.nameFor(r.registration_type)} · ${r.guardian_email}`,
      timestamp: r.created_at,
      link: `/registrations/${r.id}`,
    });
  }
  for (const r of sponsors.results || []) {
    const key = `sponsorship:${r.id}`;
    if (snoozedSet.has(key)) continue;
    items.push({
      kind: "sponsorship", id: String(r.id), urgency: "medium",
      title: `New sponsorship: ${r.organization || "(no org)"}`,
      detail: `${r.contact_email || r.contact_phone || ""} · ${(r.message || "").slice(0, 80)}`,
      timestamp: r.created_at,
      link: "/sponsorships",
    });
  }
  for (const r of coupons.results || []) {
    const key = `expiring_coupon:${r.code}`;
    if (snoozedSet.has(key)) continue;
    items.push({
      kind: "expiring_coupon", id: r.code, urgency: "low",
      title: `Coupon expiring: ${r.code}`,
      detail: `Expires ${r.expires_at} · ${r.used_count}/${r.max_uses ?? "∞"} used`,
      timestamp: r.expires_at,
      link: "/coupons",
    });
  }

  // High-urgency items first; within each tier, oldest-first so the most
  // overdue stuff floats to the top.
  const urgencyOrder = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => {
    const u = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    if (u !== 0) return u;
    return String(a.timestamp || "").localeCompare(String(b.timestamp || ""));
  });

  return c.json({
    ok: true,
    items,
    counts: {
      total: items.length,
      high: items.filter((i) => i.urgency === "high").length,
      medium: items.filter((i) => i.urgency === "medium").length,
      low: items.filter((i) => i.urgency === "low").length,
    },
  });
});

// POST /api/admin/triage/snooze { kind, id, hours }
admin.post("/triage/snooze", async (c) => {
  const body  = await c.req.json();
  const kind  = String(body.kind || "");
  const id    = String(body.id || "");
  const hours = Number(body.hours);
  if (!kind || !id) return c.json({ error: "kind + id required." }, 400);
  // Clamp to a whole number of hours in a sane range (1h - 1yr), default 24.
  const validHours  = Math.min(Math.max(Math.floor(Number(hours) || 24), 1), 8760);
  const snoozedUntil = new Date(Date.now() + validHours * 60 * 60 * 1000).toISOString();
  const session = c.get("session");

  await c.env.DB.prepare(`
    INSERT INTO triage_state (admin_account_id, target_kind, target_id, snoozed_until)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(admin_account_id, target_kind, target_id)
    DO UPDATE SET snoozed_until = ?, resolved_at = NULL
  `).bind(session.account_id, kind, id, snoozedUntil, snoozedUntil).run();

  return c.json({ ok: true, snoozed_hours: validHours });
});

// POST /api/admin/triage/dismiss { kind, id }
admin.post("/triage/dismiss", async (c) => {
  const body = await c.req.json();
  const kind = String(body.kind || "");
  const id   = String(body.id || "");
  if (!kind || !id) return c.json({ error: "kind + id required." }, 400);
  const session = c.get("session");

  await c.env.DB.prepare(`
    INSERT INTO triage_state (admin_account_id, target_kind, target_id, snoozed_until, resolved_at)
    VALUES (?, ?, ?, NULL, datetime('now'))
    ON CONFLICT(admin_account_id, target_kind, target_id)
    DO UPDATE SET snoozed_until = NULL, resolved_at = datetime('now')
  `).bind(session.account_id, kind, id).run();

  return c.json({ ok: true });
});

// ─── System health (P12) ─────────────────────────────────────────────────
// Snapshots the state of every external dependency the worker relies on.
// Cheap to compute - no outbound calls to third-party APIs (those would
// add latency + count against quota). For now we report config presence
// + last-known activity. A "deeper" health probe (actual ShurjoPay
// /api/login attempt) lives at /api/admin/system/probe behind a button.

admin.get("/system", async (c) => {
  const env = c.env;
  const [d1Probe, lastBroadcast, lastPayment, lastReg] = await Promise.all([
    c.env.DB.prepare("SELECT 1 AS one").first().catch(() => null),
    c.env.DB.prepare("SELECT sent_at FROM broadcast_log ORDER BY sent_at DESC LIMIT 1").first().catch(() => null),
    c.env.DB.prepare("SELECT updated_at FROM payments WHERE status='paid' ORDER BY updated_at DESC LIMIT 1").first().catch(() => null),
    c.env.DB.prepare("SELECT created_at FROM registrations ORDER BY created_at DESC LIMIT 1").first().catch(() => null),
  ]);

  return c.json({
    ok: true,
    services: {
      d1:           { ok: d1Probe?.one === 1, hint: d1Probe?.one === 1 ? "responsive" : "no response" },
      assets:       { ok: !!env.ASSET_REPO_BASE || (!!env.GITHUB_REPO && !!env.GITHUB_TOKEN), hint: env.ASSET_REPO_BASE ? "dev sidecar" : (env.GITHUB_REPO && env.GITHUB_TOKEN ? "github repo" : "not configured") },
      shurjopay:    {
        ok: !!env.SHURJOPAY_USERNAME && !!env.SHURJOPAY_PASSWORD && !!env.SHURJOPAY_PREFIX,
        hint: !!env.SHURJOPAY_USERNAME ? `endpoint=${env.SHURJOPAY_SANDBOX === "false" || env.ENVIRONMENT === "production" ? "engine" : "sandbox"} prefix=${env.SHURJOPAY_PREFIX || "?"}` : "missing credentials",
      },
      brevo:        { ok: !!env.BREVO_API_KEY, hint: !!env.BREVO_API_KEY ? "key present" : "no key" },
      email_from:   { ok: !!env.EMAIL_FROM, hint: env.EMAIL_FROM || "not set" },
    },
    environment: env.ENVIRONMENT || "unknown",
    timestamps: {
      last_paid_payment: lastPayment?.updated_at || null,
      last_registration: lastReg?.created_at || null,
      last_broadcast:    lastBroadcast?.sent_at || null,
    },
  });
});

// ─── User actions (P8) ───────────────────────────────────────────────────

// POST /api/admin/users/:id/send-password-reset
admin.post("/users/:id/send-password-reset", async (c) => {
  const id = c.req.param("id");
  const account = await c.env.DB.prepare(
    "SELECT id, email FROM guardian_accounts WHERE id = ? LIMIT 1"
  ).bind(id).first();
  if (!account) return c.json({ error: "Account not found." }, 404);

  // Invalidate older tokens so only the freshly-minted one works.
  await c.env.DB.prepare("DELETE FROM password_reset_tokens WHERE account_id = ?").bind(id).run();
  const token = await createPasswordResetToken(c.env, id);
  const resetUrl = `${getBaseUrl(c.req.raw)}/reset-password?token=${token}`;
  await sendPasswordResetEmail(c.env, account.email, resetUrl);

  const session = c.get("session");
  await recordAudit(c.env, session.account_id, "user.send_password_reset", {
    type: "user", id, payload: { email: account.email },
  });
  return c.json({ ok: true });
});

// POST /api/admin/users/:id/force-reverify-email
admin.post("/users/:id/force-reverify-email", async (c) => {
  const id = c.req.param("id");
  const account = await c.env.DB.prepare(
    "SELECT id, email FROM guardian_accounts WHERE id = ? LIMIT 1"
  ).bind(id).first();
  if (!account) return c.json({ error: "Account not found." }, 404);

  await c.env.DB.prepare("UPDATE guardian_accounts SET email_verified = 0 WHERE id = ?").bind(id).run();
  await c.env.DB.prepare("DELETE FROM email_verification_tokens WHERE account_id = ?").bind(id).run();
  const token = await createVerificationToken(c.env, id);
  const verifyUrl = `${getBaseUrl(c.req.raw)}/api/verify-email?token=${token}`;
  await sendVerificationEmail(c.env, account.email, verifyUrl);

  const session = c.get("session");
  await recordAudit(c.env, session.account_id, "user.force_reverify_email", {
    type: "user", id, payload: { email: account.email },
  });
  return c.json({ ok: true });
});

// ─── Bulk coupon generation (P8) ─────────────────────────────────────────
// POST /api/admin/coupons/bulk-generate
//   { prefix, count, discount_type, discount_value, max_uses_per_code,
//     applies_to?, expires_at? }
// Mints N unique codes shaped `<PREFIX>-<5-char-random>`. Returns the
// full list so the admin can CSV-export and hand off to a partner.
admin.post("/coupons/bulk-generate", async (c) => {
  const body  = await c.req.json();
  const prefix = String(body.prefix || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const count  = Math.max(1, Math.min(500, Number(body.count) || 0));
  const type   = body.discount_type === "fixed" ? "fixed" : "percent";
  const value  = Number(body.discount_value);
  const maxUses = body.max_uses_per_code == null ? null : Number(body.max_uses_per_code);
  const expiresAt = body.expires_at ? String(body.expires_at).trim() : null;
  const appliesTo = body.applies_to ? String(body.applies_to).trim() : null;

  if (!prefix) return c.json({ error: "prefix required (uppercase letters/digits)." }, 400);
  if (!Number.isFinite(value) || value <= 0) return c.json({ error: "discount_value must be positive." }, 400);

  // Build N codes. SQLite has no native randomness for cryptographic use,
  // so we generate in JS and rely on UNIQUE(code) to reject collisions.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // unambiguous
  const minted = [];
  let attempts = 0;
  const session = c.get("session");
  while (minted.length < count && attempts < count * 6) {
    attempts++;
    const r = new Uint8Array(5);
    crypto.getRandomValues(r);
    const tail = Array.from(r, (b) => alphabet[b % alphabet.length]).join("");
    const code = `${prefix}-${tail}`;
    try {
      await c.env.DB.prepare(`
        INSERT INTO coupons (code, discount_type, discount_value, max_uses, used_count, applies_to, expires_at, created_at)
        VALUES (?, ?, ?, ?, 0, ?, ?, datetime('now'))
      `).bind(code, type, value, maxUses, appliesTo, expiresAt).run();
      minted.push(code);
    } catch { /* collision - retry */ }
  }

  await recordAudit(c.env, session.account_id, "coupon.bulk_generate", {
    type: "coupon", id: prefix,
    payload: { prefix, count: minted.length, discount_type: type, discount_value: value, max_uses_per_code: maxUses, expires_at: expiresAt, applies_to: appliesTo },
  });

  return c.json({ ok: true, codes: minted, generated: minted.length, requested: count });
});

// ─── Email templates ─────────────────────────────────────────────────────
// Saved subject + body pairs the Broadcast page can load. {{vars}} aren't
// expanded here - that's a future enhancement on the broadcast send path.

admin.get("/templates", async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT id, name, subject, body, category, updated_at, updated_by
    FROM email_templates ORDER BY name
  `).all();
  return c.json({ ok: true, rows: rows.results || [] });
});

admin.post("/templates", async (c) => {
  const body = await c.req.json();
  const name = (body.name || "").trim();
  const subject = (body.subject || "").trim();
  const tplBody = (body.body || "").trim();
  const category = (body.category || "").trim() || null;
  if (!name || !subject || !tplBody) return c.json({ error: "name, subject, body required." }, 400);

  const session = c.get("session");
  try {
    const result = await c.env.DB.prepare(`
      INSERT INTO email_templates (name, subject, body, category, updated_by)
      VALUES (?, ?, ?, ?, ?)
    `).bind(name, subject, tplBody, category, session.account_id).run();
    return c.json({ ok: true, id: result.meta?.last_row_id });
  } catch (err) {
    if (String(err?.message || "").includes("UNIQUE")) {
      return c.json({ error: "A template with this name already exists." }, 409);
    }
    console.error("[admin.template] save failed:", err?.stack || err?.message || err);
    return c.json({ error: "Failed to save template." }, 500);
  }
});

admin.patch("/templates/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Bad id." }, 400);
  const body = await c.req.json();
  const sets  = [];
  const binds = [];
  for (const f of ["name", "subject", "body", "category"]) {
    if (f in body) { sets.push(`${f} = ?`); binds.push((body[f] || "").trim() || null); }
  }
  if (sets.length === 0) return c.json({ error: "No editable fields provided." }, 400);
  const session = c.get("session");
  sets.push("updated_at = datetime('now')");
  sets.push("updated_by = ?");
  binds.push(session.account_id);
  await c.env.DB.prepare(`UPDATE email_templates SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, id).run();
  return c.json({ ok: true });
});

admin.delete("/templates/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Bad id." }, 400);
  await c.env.DB.prepare("DELETE FROM email_templates WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

// GET /api/admin/broadcast/log - past sends with sent/failed counts.
admin.get("/broadcast/log", async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT b.id, b.subject, b.body, b.filters_json, b.recipient_count,
           b.sent_count, b.failed_count, b.channel, b.sent_at,
           a.email AS sent_by_email
    FROM broadcast_log b
    LEFT JOIN guardian_accounts a ON a.id = b.sent_by
    ORDER BY b.sent_at DESC
    LIMIT 200
  `).all();
  return c.json({ ok: true, rows: rows.results || [] });
});

// ─── Event-day operations (roster, attendance, scores) ──────────────────
//
// "Events" are free-form keys (e.g. 'national-round-2026', 'tst-2026').
// We don't materialise an events table - each event_key just becomes a
// scope on attendance/scores rows. The endpoints below take a venue +
// class filter to narrow the working set for organisers on the day.

// GET /api/admin/events  - distinct event keys seen so far in either table.
const safeJsonArray = (s) => { try { const v = JSON.parse(s || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };

admin.get("/events", async (c) => {
  const events = (await c.env.DB.prepare(
    "SELECT cohort_key AS event_key, label, program_slug, sections, results_published, published_at FROM cohorts WHERE sections != '[]' ORDER BY cohort_key"
  ).all()).results || [];
  // How many distinct registrations have at least one score per event.
  const counts = (await c.env.DB.prepare(
    "SELECT event_key, COUNT(DISTINCT registration_id) AS n FROM scores GROUP BY event_key"
  ).all()).results || [];
  const countMap = Object.fromEntries((counts).map((r) => [r.event_key, Number(r.n) || 0]));
  return c.json({
    ok: true,
    rows: events.map((e) => ({
      event_key: e.event_key,
      label: e.label,
      program_slug: e.program_slug,
      sections: safeJsonArray(e.sections),
      results_published: e.results_published === 1,
      published_at: e.published_at,
      scored: countMap[e.event_key] || 0,
    })),
  });
});

// GET /api/admin/events/:event/roster?venue=&class=
// Roster = paid registrations for the event's program, with attendance, the
// guardian's BdMSO ID, and any scores entered so far (keyed by section).
admin.get("/events/:event/roster", async (c) => {
  const catalog = await getCatalog(c);
  const event_key = c.req.param("event");
  const venue = c.req.query("venue");
  const klass = c.req.query("class");

  const ev = await c.env.DB.prepare(
    "SELECT program_slug, sections FROM cohorts WHERE cohort_key = ? LIMIT 1"
  ).bind(event_key).first();
  if (!ev) return c.json({ error: "Unknown event." }, 404);

  const wheres = ["r.status = 'paid'", "r.registration_type = ?"];
  const binds  = [ev.program_slug];
  if (venue) { wheres.push("r.preferred_venue = ?");    binds.push(venue); }
  if (klass) { wheres.push("r.student_class_name = ?"); binds.push(klass); }
  // Run-priced programs: a registration's primary cohort_key may be a different
  // run, so scope the roster to regs actually enrolled in THIS run (their
  // program_options holds event_key) or already scored for it (covers the
  // free-mock auto-enroll tie-in). Legacy programs keep showing every paid reg
  // of the program, as today.
  if (catalog.isRunPriced(ev.program_slug)) {
    // Source of truth is the receipt (registration_cohorts); the program_options
    // LIKE clause is the transition fallback for regs not yet migrated to the
    // receipt and is removed once the backfill runs (plan.md Phase 6). "scored"
    // keeps free-mock auto-enrolled students on the roster.
    wheres.push(
      "(r.id IN (SELECT registration_id FROM registration_cohorts WHERE cohort_key = ?)" +
      " OR r.program_options LIKE ?" +
      " OR r.id IN (SELECT registration_id FROM scores WHERE event_key = ?))",
    );
    binds.push(event_key);
    binds.push('%"' + event_key + '"%');
    binds.push(event_key);
  }
  const whereSql = `WHERE ${wheres.join(" AND ")}`;

  const rows = await c.env.DB.prepare(`
    SELECT r.id, r.student_full_name, r.student_class_name, r.student_gender,
           r.student_school, r.student_district, r.preferred_venue,
           r.registration_type, r.program_options,
           a.member_id,
           att.status        AS attendance_status,
           att.checked_in_at AS checked_in_at
    FROM registrations r
    LEFT JOIN guardian_accounts a ON a.id = r.guardian_account_id
    LEFT JOIN attendance att ON att.registration_id = r.id AND att.event_key = ?
    ${whereSql}
    ORDER BY r.preferred_venue, r.student_class_name, r.student_full_name
    LIMIT 5000
  `).bind(event_key, ...binds).all();

  // Scores entered for this event, grouped by registration -> { section: {score,max,rank,tier,detail} }.
  const scoreRows = (await c.env.DB.prepare(
    "SELECT registration_id, section, score, max_score, rank, tier, detail_json FROM scores WHERE event_key = ?"
  ).bind(event_key).all()).results || [];
  const parseDetail = (j) => { try { return j ? JSON.parse(j) : null; } catch { return null; } };
  const scoreMap = {};
  for (const s of scoreRows) {
    (scoreMap[s.registration_id] ??= {})[s.section] =
      { score: s.score, max: s.max_score, rank: s.rank, tier: s.tier, detail: parseDetail(s.detail_json) };
  }

  return c.json({
    ok: true,
    event_key, program_slug: ev.program_slug, sections: safeJsonArray(ev.sections),
    venue: venue || null, class: klass || null,
    rows: (rows.results || []).map((r) => ({
      ...r,
      program_label: catalog.nameFor(r.registration_type),
      attendance_status: r.attendance_status || "absent",
      scores: scoreMap[r.id] || {},
    })),
  });
});

// POST /api/admin/events/:event/checkin  { registration_id, status, notes? }
admin.post("/events/:event/checkin", async (c) => {
  const event_key = c.req.param("event");
  const body = await c.req.json();
  const regId = String(body.registration_id || "");
  const status = ["present", "absent", "late", "no_show"].includes(body.status) ? body.status : "present";
  const notes = (body.notes || "").trim() || null;
  if (!regId) return c.json({ error: "registration_id required." }, 400);

  const exists = await c.env.DB.prepare("SELECT 1 FROM registrations WHERE id = ?").bind(regId).first();
  if (!exists) return c.json({ error: "Registration not found." }, 404);

  const session = c.get("session");
  await c.env.DB.prepare(`
    INSERT INTO attendance (registration_id, event_key, status, checked_in_at, checked_in_by, notes)
    VALUES (?, ?, ?, datetime('now'), ?, ?)
    ON CONFLICT(registration_id, event_key) DO UPDATE SET
      status = excluded.status,
      checked_in_at = excluded.checked_in_at,
      checked_in_by = excluded.checked_in_by,
      notes = excluded.notes
  `).bind(regId, event_key, status, session.account_id, notes).run();

  return c.json({ ok: true });
});

// POST /api/admin/events/:event/scores  { registration_id, section, score, max_score }
admin.post("/events/:event/scores", async (c) => {
  const event_key = c.req.param("event");
  const body = await c.req.json();
  const regId = String(body.registration_id || "");
  const section = String(body.section || "").trim();
  const score = Number(body.score);
  const maxScore = Number(body.max_score);
  if (!regId || !section) return c.json({ error: "registration_id + section required." }, 400);
  if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) {
    return c.json({ error: "score and max_score must be positive numbers." }, 400);
  }
  if (score < 0 || score > maxScore) {
    return c.json({ error: "score must be between 0 and max_score." }, 400);
  }

  const session = c.get("session");
  await c.env.DB.prepare(`
    INSERT INTO scores (registration_id, event_key, section, score, max_score, entered_by)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(registration_id, event_key, section) DO UPDATE SET
      score = excluded.score, max_score = excluded.max_score,
      entered_at = datetime('now'), entered_by = excluded.entered_by,
      rank = NULL, tier = NULL
  `).bind(regId, event_key, section, score, maxScore, session.account_id).run();

  return c.json({ ok: true });
});

// POST /api/admin/events/:event/scores/finalize  { section, tier_top? }
// Computes ranks within a section and tags top N as a tier. tier_top can be
// either a number (top-N goes into 'all-round' / 'math' / 'science' depending
// on section) or omitted (just sets rank).
admin.post("/events/:event/scores/finalize", async (c) => {
  const event_key = c.req.param("event");
  const body    = await c.req.json();
  const section = String(body.section || "").trim();
  const tierTop = Number.isFinite(Number(body.tier_top)) ? Math.max(0, Math.floor(Number(body.tier_top))) : 0;
  if (!section) return c.json({ error: "section required." }, 400);

  const rows = await c.env.DB.prepare(
    "SELECT id FROM scores WHERE event_key = ? AND section = ? ORDER BY score DESC, registration_id"
  ).bind(event_key, section).all();
  const list = rows.results || [];
  if (list.length === 0) return c.json({ error: "No scores recorded for this section." }, 404);

  const tier = section.includes("math") ? "math"
             : section.includes("science") ? "science"
             : "all-round";

  // Apply ranks + tiers in one atomic batch (was a sequential UPDATE per row -
  // hundreds of round-trips, and a mid-loop failure left a half-ranked section).
  // Concurrent finalize calls would still race; the audit log records both.
  const session = c.get("session");
  await c.env.DB.batch(list.map((row, i) => {
    const rank = i + 1;
    const rowTier = rank <= tierTop ? tier : null;
    return c.env.DB.prepare("UPDATE scores SET rank = ?, tier = ? WHERE id = ?").bind(rank, rowTier, row.id);
  }));

  await recordAudit(c.env, session.account_id, "scores.finalize", {
    type: "scores", id: event_key,
    payload: { section, count: list.length, tier_top: tierTop, tier },
  });

  return c.json({ ok: true, ranked: list.length, tier_top: tierTop });
});

// Prep students get free mock tests, but the number per season isn't fixed - so
// the free enrollment is materialized at result-import time for the mocks they
// actually sit, rather than granted up front. A paid registration in any of
// these programs qualifies for a free mock-test enrollment.
const MOCK_PROGRAM = "mock-test";
const FREE_MOCK_QUALIFIERS = ["bdmso-preparatory-camp", "bdmso-preparatory"];

// POST /api/admin/events/:event/scores/import
//   { rows: [{ member_id, scores: { <sectionId>: number } }], commit?: bool }
// Bulk score import keyed by BdMSO ID. Returns a per-row classification
// (matched / autoEnrolled / unmatched / invalid); only writes when commit=true.
// For a mock-test event, an eligible prep-camp student with no mock-test reg is
// auto-enrolled (free, paid) so their score can be recorded.
admin.post("/events/:event/scores/import", async (c) => {
  const event_key = c.req.param("event");
  const body   = await c.req.json();
  const commit = body.commit === true;
  const inputRows = Array.isArray(body.rows) ? body.rows : [];

  const ev = await c.env.DB.prepare(
    "SELECT program_slug, sections FROM cohorts WHERE cohort_key = ? LIMIT 1"
  ).bind(event_key).first();
  if (!ev) return c.json({ error: "Unknown event." }, 404);
  const sections = safeJsonArray(ev.sections);
  const maxBySection = Object.fromEntries(sections.map((s) => [s.id, Number(s.max)]));

  const matched = [], autoEnrolledRows = [], unmatched = [], invalid = [];
  const writes = [];
  const session = c.get("session");

  for (const raw of inputRows) {
    const memberId = String(raw.member_id || "").trim();
    if (!memberId) { unmatched.push({ member_id: "", reason: "missing BdMSO ID" }); continue; }

    // BdMSO ID -> account -> the registration for this event's program.
    let reg = await c.env.DB.prepare(`
      SELECT r.id, r.student_full_name
      FROM registrations r
      JOIN guardian_accounts a ON a.id = r.guardian_account_id
      WHERE a.member_id = ? AND r.registration_type = ? AND r.status = 'paid'
      LIMIT 1
    `).bind(memberId, ev.program_slug).first();

    // Free mock-test benefit: a paid prep-camp student with no mock-test reg yet
    // is auto-enrolled (free, paid) so their result can be recorded. Preview
    // (commit=false) only reports it; commit actually creates the enrollment.
    let isAuto = false;
    if (!reg && ev.program_slug === MOCK_PROGRAM) {
      const ph = FREE_MOCK_QUALIFIERS.map(() => "?").join(",");
      const src = await c.env.DB.prepare(`
        SELECT r.* FROM registrations r
        JOIN guardian_accounts a ON a.id = r.guardian_account_id
        WHERE a.member_id = ? AND r.registration_type IN (${ph}) AND r.status = 'paid'
        ORDER BY r.created_at DESC LIMIT 1
      `).bind(memberId, ...FREE_MOCK_QUALIFIERS).first();
      if (src) {
        isAuto = true;
        if (commit) {
          const regId = createId("app");
          const now = new Date().toISOString();
          await c.env.DB.batch([
            c.env.DB.prepare(`
              INSERT INTO registrations
                (id, registration_type, student_full_name, student_date_of_birth, student_class_name,
                 student_gender, student_medium, student_school, student_district, guardian_account_id,
                 guardian_full_name, guardian_relationship, guardian_phone, guardian_email, guardian_address,
                 terms_accepted, status, source_page, cohort_key, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'paid', 'mock-free-grant', ?, ?)
            `).bind(regId, MOCK_PROGRAM, src.student_full_name, src.student_date_of_birth, src.student_class_name,
              src.student_gender, src.student_medium, src.student_school, src.student_district, src.guardian_account_id,
              src.guardian_full_name, src.guardian_relationship, src.guardian_phone, src.guardian_email,
              src.guardian_address, event_key, now),
            c.env.DB.prepare(
              "INSERT INTO payments (id, registration_id, amount, currency, tran_id, status, cohort_key, created_at, updated_at) VALUES (?, ?, 0, 'BDT', ?, 'paid', ?, ?, ?)"
            ).bind(createId("pay"), regId, createId("txn"), event_key, now, now),
          ]);
          reg = { id: regId, student_full_name: src.student_full_name };
        } else {
          reg = { id: null, student_full_name: src.student_full_name }; // preview placeholder
        }
      }
    }
    if (!reg) { unmatched.push({ member_id: memberId, reason: "no paid registration for this event" }); continue; }

    const scores = raw.scores && typeof raw.scores === "object" ? raw.scores : {};
    const detailBySection = raw.detail && typeof raw.detail === "object" ? raw.detail : {};
    const cleaned = [];
    let bad = null;
    for (const [sectionId, val] of Object.entries(scores)) {
      if (val === "" || val == null) continue;            // blank cell -> skip that section
      const max = maxBySection[sectionId];
      if (max == null) { bad = `unknown section "${sectionId}"`; break; }
      const num = Number(val);
      if (!Number.isFinite(num) || num < 0 || num > max) { bad = `${sectionId}=${val} out of 0..${max}`; break; }
      const detail = detailBySection[sectionId] && typeof detailBySection[sectionId] === "object" ? detailBySection[sectionId] : null;
      cleaned.push({ section: sectionId, score: num, max, detail });
    }
    if (bad) { invalid.push({ member_id: memberId, student: reg.student_full_name, reason: bad }); continue; }
    if (cleaned.length === 0) { invalid.push({ member_id: memberId, student: reg.student_full_name, reason: "no scores" }); continue; }

    (isAuto ? autoEnrolledRows : matched).push({ member_id: memberId, student: reg.student_full_name, sections: cleaned.length });
    if (commit) {
      for (const cs of cleaned) {
        writes.push(c.env.DB.prepare(`
          INSERT INTO scores (registration_id, event_key, section, score, max_score, entered_by, detail_json)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(registration_id, event_key, section) DO UPDATE SET
            score = excluded.score, max_score = excluded.max_score,
            detail_json = excluded.detail_json,
            entered_at = datetime('now'), entered_by = excluded.entered_by,
            rank = NULL, tier = NULL
        `).bind(reg.id, event_key, cs.section, cs.score, cs.max, session.account_id, cs.detail ? JSON.stringify(cs.detail) : null));
      }
    }
  }

  if (commit && (writes.length || autoEnrolledRows.length)) {
    if (writes.length) await c.env.DB.batch(writes);
    await recordAudit(c.env, session.account_id, "scores.import", {
      type: "scores", id: event_key,
      payload: {
        matched: matched.length, autoEnrolled: autoEnrolledRows.length,
        unmatched: unmatched.length, invalid: invalid.length,
        autoEnrolledIds: autoEnrolledRows.map((r) => r.member_id),
      },
    });
  }

  return c.json({
    ok: true, committed: commit,
    summary: { matched: matched.length, autoEnrolled: autoEnrolledRows.length, unmatched: unmatched.length, invalid: invalid.length },
    matched, autoEnrolled: autoEnrolledRows, unmatched, invalid,
  });
});

// POST /api/admin/events/:event/publish  { published: bool }
// Release / unrelease results to guardians for this event.
admin.post("/events/:event/publish", async (c) => {
  const event_key = c.req.param("event");
  const body = await c.req.json();
  const publish = body.published === true;

  const ev = await c.env.DB.prepare("SELECT label, results_published FROM cohorts WHERE cohort_key = ? LIMIT 1").bind(event_key).first();
  if (!ev) return c.json({ error: "Unknown event." }, 404);
  const wasPublished = ev.results_published === 1;

  await c.env.DB.prepare(
    "UPDATE cohorts SET results_published = ?, published_at = CASE WHEN ? THEN datetime('now') ELSE NULL END WHERE cohort_key = ?"
  ).bind(publish ? 1 : 0, publish ? 1 : 0, event_key).run();

  const session = c.get("session");
  await recordAudit(c.env, session.account_id, "results.publish", {
    type: "exam_event", id: event_key, payload: { published: publish },
  });

  // Notify guardians once, only on the 0 -> 1 transition (so re-publishing or a
  // no-op publish doesn't re-mail). Best-effort: an email hiccup must not fail
  // the publish. Targets guardians whose child actually has a score recorded.
  let notified = 0;
  if (publish && !wasPublished) {
    try {
      const rows = (await c.env.DB.prepare(`
        SELECT DISTINCT r.guardian_email AS email
        FROM registrations r
        WHERE r.cohort_key = ? AND r.guardian_email IS NOT NULL AND TRIM(r.guardian_email) != ''
          AND EXISTS (SELECT 1 FROM scores s WHERE s.registration_id = r.id)
      `).bind(event_key).all()).results || [];
      const recipients = rows.map((x) => x.email);
      if (recipients.length) {
        const baseUrl = getBaseUrl(c.req.raw);
        const res = await sendBroadcastEmail(c.env, {
          subject: `Your ${ev.label} results are now available`,
          message: `Results for ${ev.label} have been published.\n\nSign in to your dashboard to view your child's score and ranking:\n${baseUrl}/dashboard`,
          recipients,
        });
        notified = res.sent || 0;
      }
    } catch (err) {
      console.error("[results.publish] guardian notification failed:", err?.message || err);
    }
  }

  return c.json({ ok: true, published: publish, notified });
});

// ─── Cohorts (program runs) ──────────────────────────────────────────────
// A cohort = one scheduled run of a program. cohort_key is INTERNAL, format
// {slug}-{MM}{YY} (MM = start month for repeatable programs, 00 once-a-year),
// with -b2/-b3 appended only if the same program runs twice in one month.
const COHORT_STATUSES = ["draft", "upcoming", "enrolling", "running", "ended", "archived"];

// Compute MM (00 for non-repeatable) + the next free key for a program/run.
async function nextCohortKey(env, programSlug, repeatable, startsOn, enrollOpens) {
  const src  = startsOn || enrollOpens || null;
  const year = (src && src.length >= 4) ? src.slice(0, 4) : String(new Date().getUTCFullYear());
  const yy   = year.slice(-2);
  const mm   = (repeatable === 1 && startsOn && startsOn.length >= 7) ? startsOn.slice(5, 7) : "00";
  const base = `${programSlug}-${mm}${yy}`;
  const taken = async (k) => !!(await env.DB.prepare("SELECT 1 FROM cohorts WHERE cohort_key = ?").bind(k).first());
  if (!(await taken(base))) return { key: base, year };
  let n = 2;
  while (await taken(`${base}-b${n}`)) n++;
  return { key: `${base}-b${n}`, year };
}

// SQL mirror of deriveCohortStage() in lib/program-options.js - keep in sync.
// `date('now')` is UTC, matching deriveRegState's notion of today. `pfx` is the
// table alias (e.g. "c") or "" for unqualified columns.
function cohortStageSQL(pfx) {
  const p = pfx ? `${pfx}.` : "";
  return `CASE
    WHEN ${p}status IN ('draft','archived') THEN ${p}status
    WHEN ${p}enroll_opens IS NULL AND ${p}enroll_closes IS NULL AND ${p}starts_on IS NULL AND ${p}ends_on IS NULL THEN ${p}status
    WHEN ${p}ends_on IS NOT NULL AND date('now') > ${p}ends_on THEN 'ended'
    WHEN ${p}enroll_opens IS NOT NULL AND date('now') < ${p}enroll_opens THEN 'upcoming'
    WHEN ${p}enroll_closes IS NULL OR date('now') <= ${p}enroll_closes THEN 'enrolling'
    ELSE 'running' END`;
}

admin.get("/cohorts", async (c) => {
  const rows = (await c.env.DB.prepare(`
    SELECT c.cohort_key, c.program_slug, c.label, c.status, c.enroll_opens, c.enroll_closes,
           c.starts_on, c.ends_on, c.price_override, c.choice_group, c.capacity, c.sections,
           c.results_published, c.public_featured, c.published_at, c.created_at,
           COUNT(r.id)                                        AS regs,
           SUM(CASE WHEN r.status = 'paid' THEN 1 ELSE 0 END) AS paid
    FROM cohorts c
    LEFT JOIN registrations r ON r.cohort_key = c.cohort_key
    GROUP BY c.cohort_key
    ORDER BY c.program_slug, c.created_at DESC
  `).all()).results || [];
  return c.json({
    ok: true,
    // status is the DERIVED lifecycle stage (from the run's own dates); 'draft'
    // and 'archived' pass through as the only manual overrides.
    rows: rows.map((r) => ({
      ...r,
      status: deriveCohortStage(r.status, r.enroll_opens, r.enroll_closes, r.starts_on, r.ends_on),
      sections: safeJsonArray(r.sections),
      results_published: r.results_published === 1,
      public_featured: r.public_featured === 1,
    })),
  });
});

// POST /api/admin/cohorts  { program_slug, label?, status? }  - "Open new run".
// The Program page is the single edit surface for schedule/price; this just
// SNAPSHOTS the program's current registration + session dates into a new run
// and carries the exam sections from the program's most recent run. To change a
// run's dates/price you edit the program first, then open the run.
admin.post("/cohorts", async (c) => {
  const b = await c.req.json();
  const programSlug = String(b.program_slug || "").trim();
  if (!programSlug) return c.json({ error: "program_slug required." }, 400);
  const prog = await c.env.DB.prepare(
    "SELECT slug, title, repeatable, registration_opens, registration_closes, starts_on, ends_on FROM programs WHERE slug = ? LIMIT 1"
  ).bind(programSlug).first();
  if (!prog) return c.json({ error: "Unknown program." }, 404);

  const { key, year } = await nextCohortKey(c.env, programSlug, prog.repeatable, prog.starts_on, prog.registration_opens);
  const label   = (b.label || "").trim() || `${prog.title} ${year}`;
  const status  = COHORT_STATUSES.includes(b.status) ? b.status : "enrolling";
  // Carry exam sections from the program's previous run (if any).
  const prev = await c.env.DB.prepare(
    "SELECT sections FROM cohorts WHERE program_slug = ? ORDER BY created_at DESC LIMIT 1"
  ).bind(programSlug).first();

  await c.env.DB.prepare(`
    INSERT INTO cohorts (cohort_key, program_slug, label, status, enroll_opens, enroll_closes, starts_on, ends_on, sections)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    key, programSlug, label, status,
    prog.registration_opens, prog.registration_closes, prog.starts_on, prog.ends_on,
    prev?.sections || "[]",
  ).run();

  const session = c.get("session");
  await recordAudit(c.env, session.account_id, "cohort.open", { type: "cohort", id: key, payload: { program: programSlug, status } });
  return c.json({ ok: true, cohort_key: key });
});

// PATCH /api/admin/cohorts/:key - lifecycle (status) + label + price_override.
// For run-priced programs the per-run price is what students pay, so the price
// is editable here; dates are still a program-page concern (re-snapshotted on
// new run).
admin.patch("/cohorts/:key", async (c) => {
  const key = c.req.param("key");
  const b   = await c.req.json();
  const exists = await c.env.DB.prepare("SELECT 1 FROM cohorts WHERE cohort_key = ? LIMIT 1").bind(key).first();
  if (!exists) return c.json({ error: "Unknown cohort." }, 404);

  const sets = [], binds = [];
  if (typeof b.label === "string" && b.label.trim()) { sets.push("label = ?"); binds.push(b.label.trim()); }
  if (COHORT_STATUSES.includes(b.status)) { sets.push("status = ?"); binds.push(b.status); }
  if (b.price_override !== undefined) {
    if (b.price_override === null || b.price_override === "") {
      sets.push("price_override = ?"); binds.push(null);
    } else {
      const num = Number(b.price_override);
      if (!Number.isInteger(num) || num < 0) return c.json({ error: "price_override must be a non-negative whole number or empty." }, 400);
      sets.push("price_override = ?"); binds.push(num);
    }
  }
  // choice_group: options sharing a non-empty group are mutually exclusive
  // ("choose one"); empty/null clears it ("choose any").
  if (b.choice_group !== undefined) {
    const g = typeof b.choice_group === "string" ? b.choice_group.trim() : "";
    sets.push("choice_group = ?"); binds.push(g || null);
  }
  // Per-run dates (options model): each run owns its enrol window + session
  // dates, edited here rather than inherited from the program. ISO or empty.
  for (const col of ["enroll_opens", "enroll_closes", "starts_on", "ends_on"]) {
    if (b[col] === undefined) continue;
    const v = b[col];
    if (v === null || v === "") { sets.push(`${col} = ?`); binds.push(null); }
    else if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) { sets.push(`${col} = ?`); binds.push(v); }
    else return c.json({ error: `${col} must be an ISO date (YYYY-MM-DD) or empty.` }, 400);
  }
  if (!sets.length) return c.json({ error: "No editable fields." }, 400);

  await c.env.DB.prepare(`UPDATE cohorts SET ${sets.join(", ")} WHERE cohort_key = ?`).bind(...binds, key).run();
  const session = c.get("session");
  await recordAudit(c.env, session.account_id, "cohort.update", { type: "cohort", id: key, payload: b });
  return c.json({ ok: true });
});

// DELETE /api/admin/cohorts/:key - hard delete. Refused if the run has any
// registrations (those carry payments/results); archive such runs instead.
admin.delete("/cohorts/:key", async (c) => {
  const key = c.req.param("key");
  const cohort = await c.env.DB.prepare("SELECT cohort_key, label FROM cohorts WHERE cohort_key = ? LIMIT 1").bind(key).first();
  if (!cohort) return c.json({ error: "Unknown cohort." }, 404);

  const used = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM registrations WHERE cohort_key = ?").bind(key).first();
  if (Number(used?.n || 0) > 0) {
    return c.json({ error: `This run has ${used.n} registration(s). Archive it instead of deleting.` }, 409);
  }

  // No registrations -> safe to remove, along with any generated medalists tagged to it.
  await c.env.DB.prepare("DELETE FROM medalists WHERE cohort_key = ?").bind(key).run();
  await c.env.DB.prepare("DELETE FROM cohorts WHERE cohort_key = ?").bind(key).run();

  const session = c.get("session");
  await recordAudit(c.env, session.account_id, "cohort.delete", { type: "cohort", id: key, payload: { label: cohort.label } });
  return c.json({ ok: true });
});

// POST /api/admin/cohorts/:key/feature  { featured: bool }
// Feature this run's winners on the public /results page (or unfeature). The
// public medalists are GENERATED from the cohort's finalised scores - rank 1/2/3
// per section -> gold/silver/bronze - and tagged with the cohort_key so a
// re-feature replaces cleanly. Hand-entered/historical medalists (cohort_key
// NULL) are untouched. Stages a medalist publish for the review/commit step.
const MEDAL_BY_RANK = { 1: "gold", 2: "silver", 3: "bronze" };

admin.post("/cohorts/:key/feature", async (c) => {
  const key = c.req.param("key");
  const featured = (await c.req.json().catch(() => ({})))?.featured === true;
  const cohort = await c.env.DB.prepare(
    "SELECT cohort_key, label, sections, starts_on FROM cohorts WHERE cohort_key = ? LIMIT 1"
  ).bind(key).first();
  if (!cohort) return c.json({ error: "Unknown cohort." }, 404);

  // Always clear this cohort's previously generated rows first.
  await c.env.DB.prepare("DELETE FROM medalists WHERE cohort_key = ?").bind(key).run();

  let generated = 0;
  if (featured) {
    const sections = safeJsonArray(cohort.sections);
    const labelFor = Object.fromEntries(sections.map((s) => [s.id, s.label]));
    const year = (cohort.starts_on && cohort.starts_on.length >= 4)
      ? cohort.starts_on.slice(0, 4)
      : `20${key.replace(/-b\d+$/, "").slice(-2)}`;

    const winners = (await c.env.DB.prepare(`
      SELECT s.section, s.rank, r.student_full_name AS name, r.student_school AS school
      FROM scores s JOIN registrations r ON r.id = s.registration_id
      WHERE s.event_key = ? AND s.rank IS NOT NULL AND s.rank BETWEEN 1 AND 3
      ORDER BY s.section, s.rank
    `).bind(key).all()).results || [];

    const session = c.get("session");
    const inserts = winners.map((w) => c.env.DB.prepare(`
      INSERT INTO medalists (year, category, medal, name, school, sort_order, published, cohort_key, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).bind(
      year, labelFor[w.section] || w.section, MEDAL_BY_RANK[w.rank], w.name, w.school || null, w.rank, key, session.account_id,
    ));
    if (inserts.length) await c.env.DB.batch(inserts);
    generated = inserts.length;
  }

  await c.env.DB.prepare("UPDATE cohorts SET public_featured = ? WHERE cohort_key = ?").bind(featured ? 1 : 0, key).run();
  // Stage the medalist dataset so the change reaches the public site on publish.
  await stagePending(c, "medalist", "medalist", "update");

  const session = c.get("session");
  await recordAudit(c.env, session.account_id, "cohort.feature", { type: "cohort", id: key, payload: { featured, generated } });
  return c.json({ ok: true, featured, generated });
});

// ─── Posts (D1-backed CMS) ───────────────────────────────────────────────
//
// Posts live in the `posts` D1 table (see db/schema.sql). Admin creates +
// edits via these endpoints; public reads happen in worker/index.js, which
// checks D1 first for any /posts/<slug> request before falling through to
// the static markdown files in public/posts/. Two stores coexist: dev
// authors prefer file+git, editors prefer this UI - both render the same
// public URL shape.

// Slugs are URL-safe (lowercase, hyphens, no spaces). Reject anything
// else so a published slug can't collide with worker route paths.
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,80}[a-z0-9])?$/;

const POST_FIELDS = ["title", "excerpt", "category", "author", "image", "body_md", "published", "featured", "published_at"];

// ─── Staged publish ────────────────────────────────────────────────────────
// Content edits no longer push to GitHub on save. Instead they stage a
// pending_publish row (deduped per entity), and POST /publish commits the whole
// set in one GitHub commit. For the whole-file JSON datasets (press/halloffame/
// medalist/team) every row edit collapses onto a single pending row keyed by
// the dataset name, because the published file is rebuilt from all D1 rows.
//
// entityType: 'post' | 'program' | 'press' | 'halloffame' | 'medalist' | 'team'
async function stagePending(c, entityType, entityId, action) {
  // Datasets key by the dataset name so all row edits dedupe to one row; the
  // file is rebuilt from D1 at publish time, so 'create'/'update'/'delete' all
  // resolve to the same "rebuild" action.
  const key = isDataset(entityType) ? entityType : String(entityId);
  const stageAction = isDataset(entityType) ? "update" : action;

  const mat = await materializeEntity(c.env, entityType, key, stageAction);
  const path = mat ? mat.path : pathFor(entityType, key);
  const content = mat ? mat.content : null;

  const session = c.get("session");
  const id = createId("pp");
  // UPSERT: repeated edits of the same entity keep ONE pending row (latest
  // content). The unique index on (entity_type, entity_id) drives the conflict.
  await c.env.DB.prepare(`
    INSERT INTO pending_publish
      (id, entity_type, entity_id, action, materialized_path, materialized_content, status, staged_by, staged_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now'), datetime('now'))
    ON CONFLICT(entity_type, entity_id) DO UPDATE SET
      action               = excluded.action,
      materialized_path    = excluded.materialized_path,
      materialized_content = excluded.materialized_content,
      status               = 'pending',
      staged_by            = excluded.staged_by,
      updated_at           = datetime('now')
  `).bind(id, entityType, key, stageAction, path, content, session.account_id).run();
}

admin.get("/posts", async (c) => {
  const status = c.req.query("status"); // 'published' | 'draft' | undefined
  const wheres = [];
  const binds  = [];
  if (status === "published") wheres.push("published = 1");
  else if (status === "draft") wheres.push("published = 0");
  const whereSql = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";

  const list = await c.env.DB.prepare(`
    SELECT slug, title, excerpt, category, author, image, published, featured,
           published_at, updated_at, updated_by
    FROM posts
    ${whereSql}
    ORDER BY COALESCE(published_at, updated_at) DESC
    LIMIT 200
  `).bind(...binds).all();

  const summary = await c.env.DB.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN published = 1 THEN 1 ELSE 0 END) AS published,
      SUM(CASE WHEN published = 0 THEN 1 ELSE 0 END) AS drafts,
      SUM(CASE WHEN featured  = 1 AND published = 1 THEN 1 ELSE 0 END) AS featured
    FROM posts
  `).first();

  return c.json({
    ok: true,
    rows: (list.results || []).map(normalisePostRow),
    summary: {
      total:     Number(summary?.total)     || 0,
      published: Number(summary?.published) || 0,
      drafts:    Number(summary?.drafts)    || 0,
      featured:  Number(summary?.featured)  || 0,
    },
  });
});

admin.get("/posts/:slug", async (c) => {
  const slug = c.req.param("slug");
  const row  = await c.env.DB.prepare("SELECT * FROM posts WHERE slug = ? LIMIT 1").bind(slug).first();
  if (!row) return c.json({ error: "Post not found." }, 404);
  return c.json({ ok: true, post: normalisePostRow(row, { withBody: true }) });
});

admin.post("/posts", async (c) => {
  const body    = await c.req.json();
  const slug    = (body.slug || "").trim().toLowerCase();
  if (!SLUG_RE.test(slug)) {
    return c.json({ error: "Slug must be lowercase letters/numbers/hyphens (3-80 chars)." }, 400);
  }
  const exists = await c.env.DB.prepare("SELECT 1 FROM posts WHERE slug = ?").bind(slug).first();
  if (exists) return c.json({ error: "A post with this slug already exists." }, 409);

  const session = c.get("session");
  const post = sanitisePostInput(body);
  if (!post.title)   return c.json({ error: "Title is required." }, 400);
  if (!post.body_md) return c.json({ error: "Body markdown is required." }, 400);

  await c.env.DB.prepare(`
    INSERT INTO posts (slug, title, excerpt, category, author, image, body_md,
                       published, featured, published_at, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
  `).bind(
    slug, post.title, post.excerpt, post.category, post.author, post.image, post.body_md,
    post.published, post.featured, post.published_at, session.account_id,
  ).run();

  await recordAudit(c.env, session.account_id, "post.create", {
    type: "post", id: slug,
    payload: { title: post.title, published: post.published, featured: post.featured },
  });
  await stagePending(c, "post", slug, "create");

  return c.json({ ok: true, slug });
});

admin.patch("/posts/:slug", async (c) => {
  const slug    = c.req.param("slug");
  const before  = await c.env.DB.prepare("SELECT * FROM posts WHERE slug = ? LIMIT 1").bind(slug).first();
  if (!before) return c.json({ error: "Post not found." }, 404);

  const body    = await c.req.json();
  const patch   = sanitisePostInput(body, { partial: true });
  if (Object.keys(patch).length === 0) {
    return c.json({ error: "No editable fields provided." }, 400);
  }

  const sets  = [];
  const binds = [];
  for (const f of POST_FIELDS) {
    if (f in patch) { sets.push(`${f} = ?`); binds.push(patch[f]); }
  }
  const session = c.get("session");
  sets.push("updated_at = datetime('now')");
  sets.push("updated_by = ?");
  binds.push(session.account_id);

  await c.env.DB.prepare(`UPDATE posts SET ${sets.join(", ")} WHERE slug = ?`)
    .bind(...binds, slug).run();

  await recordAudit(c.env, session.account_id, "post.update", {
    type: "post", id: slug,
    payload: Object.fromEntries(
      Object.entries(patch)
        .filter(([k]) => k !== "body_md") // don't dump full markdown into audit
        .map(([k, v]) => [k, k === "published_at" || k === "body_md" ? undefined : v])
    ),
  });
  await stagePending(c, "post", slug, "update");

  return c.json({ ok: true });
});

admin.delete("/posts/:slug", async (c) => {
  const slug   = c.req.param("slug");
  const before = await c.env.DB.prepare("SELECT slug, title FROM posts WHERE slug = ?").bind(slug).first();
  if (!before) return c.json({ error: "Post not found." }, 404);

  await c.env.DB.prepare("DELETE FROM posts WHERE slug = ?").bind(slug).run();

  const session = c.get("session");
  await recordAudit(c.env, session.account_id, "post.delete", {
    type: "post", id: slug, payload: { title: before.title },
  });
  await stagePending(c, "post", slug, "delete");

  return c.json({ ok: true });
});

// Coerce DB row to the shape the admin client expects. `withBody` keeps the
// full markdown for the editor; the list view strips it to keep responses lean.
function normalisePostRow(r, { withBody = false } = {}) {
  return {
    slug:        r.slug,
    title:       r.title,
    excerpt:     r.excerpt || "",
    category:    r.category || "",
    author:      r.author   || "",
    image:       r.image    || "",
    published:   r.published === 1 || r.published === true || r.published === "1",
    featured:    r.featured  === 1 || r.featured  === true || r.featured  === "1",
    published_at: r.published_at || null,
    updated_at:  r.updated_at,
    updated_by:  r.updated_by || null,
    ...(withBody ? { body_md: r.body_md || "" } : {}),
  };
}

// Validate + coerce input. In `partial` mode (PATCH), only provided keys
// are returned. Booleans → 0/1 ints. Strings trimmed; empty strings stored
// as NULL via the build path, except body_md/title which are required when present.
function sanitisePostInput(input, { partial = false } = {}) {
  const out = {};
  const set = (k, v) => { out[k] = v; };
  if ("title"     in input || !partial) set("title",     trimOrNull(input.title));
  if ("excerpt"   in input || !partial) set("excerpt",   trimOrNull(input.excerpt));
  if ("category"  in input || !partial) set("category",  trimOrNull(input.category));
  if ("author"    in input || !partial) set("author",    trimOrNull(input.author));
  if ("image"     in input || !partial) set("image",     trimOrNull(input.image));
  if ("body_md"   in input || !partial) set("body_md",   typeof input.body_md === "string" ? input.body_md : "");
  if ("published" in input || !partial) set("published", input.published ? 1 : 0);
  if ("featured"  in input || !partial) set("featured",  input.featured  ? 1 : 0);
  if ("published_at" in input || !partial) set("published_at", trimOrNull(input.published_at));
  return out;
}

function trimOrNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

// ─── Programs (catalogue) ─────────────────────────────────────────────────
// D1 is the source of truth for program data + the price the worker validates
// at checkout. The editor CRUDs here; publishing (materialise the .md + commit)
// is a separate step. Mirrors the Posts routes above.
const PROGRAM_CATEGORIES   = ["competition", "beginner", "advanced", "residential"];
const REGISTRATION_STATUSES = ["open", "closed", "coming_soon", "on_enquiry"];

admin.get("/programs", async (c) => {
  const status = c.req.query("status"); // 'published' | 'draft' | undefined
  const wheres = [];
  if (status === "published") wheres.push("published = 1");
  else if (status === "draft") wheres.push("published = 0");
  const whereSql = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";

  const list = await c.env.DB.prepare(`
    SELECT slug, title, category, registration_status, price_label, fee_amount,
           pricing_json, home_order, hidden, published, updated_at, updated_by
    FROM programs
    ${whereSql}
    ORDER BY COALESCE(home_order, '99'), title
    LIMIT 200
  `).all();

  const summary = await c.env.DB.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN published = 1 THEN 1 ELSE 0 END) AS published,
           SUM(CASE WHEN published = 0 THEN 1 ELSE 0 END) AS drafts
    FROM programs
  `).first();

  return c.json({
    ok: true,
    rows: (list.results || []).map((r) => normaliseProgramRow(r)),
    summary: {
      total:     Number(summary?.total)     || 0,
      published: Number(summary?.published) || 0,
      drafts:    Number(summary?.drafts)    || 0,
    },
  });
});

admin.get("/programs/:slug", async (c) => {
  const slug = c.req.param("slug");
  const row  = await c.env.DB.prepare("SELECT * FROM programs WHERE slug = ? LIMIT 1").bind(slug).first();
  if (!row) return c.json({ error: "Program not found." }, 404);
  return c.json({ ok: true, program: normaliseProgramRow(row, { withBody: true }) });
});

admin.post("/programs", async (c) => {
  const body = await c.req.json();
  const slug = (body.slug || "").trim().toLowerCase();
  if (!SLUG_RE.test(slug)) {
    return c.json({ error: "Slug must be lowercase letters/numbers/hyphens (3-80 chars)." }, 400);
  }
  const exists = await c.env.DB.prepare("SELECT 1 FROM programs WHERE slug = ?").bind(slug).first();
  if (exists) return c.json({ error: "A program with this slug already exists." }, 409);

  const sani = sanitiseProgramInput(body);
  if (sani.error) return c.json({ error: sani.error }, 400);
  if (!sani.values.title) return c.json({ error: "Title is required." }, 400);

  const session = c.get("session");
  const keys  = Object.keys(sani.values);
  const cols  = ["slug", ...keys, "updated_at", "updated_by"];
  const ph    = ["?", ...keys.map(() => "?"), "datetime('now')", "?"];
  const binds = [slug, ...keys.map((k) => sani.values[k]), session.account_id];

  await c.env.DB.prepare(`INSERT INTO programs (${cols.join(", ")}) VALUES (${ph.join(", ")})`)
    .bind(...binds).run();

  await recordAudit(c.env, session.account_id, "program.create", {
    type: "program", id: slug,
    payload: { title: sani.values.title, published: sani.values.published },
  });
  await stagePending(c, "program", slug, "create");

  return c.json({ ok: true, slug });
});

admin.patch("/programs/:slug", async (c) => {
  const slug   = c.req.param("slug");
  const before = await c.env.DB.prepare("SELECT slug FROM programs WHERE slug = ? LIMIT 1").bind(slug).first();
  if (!before) return c.json({ error: "Program not found." }, 404);

  const sani = sanitiseProgramInput(await c.req.json(), { partial: true });
  if (sani.error) return c.json({ error: sani.error }, 400);
  const keys = Object.keys(sani.values);
  if (keys.length === 0) return c.json({ error: "No editable fields provided." }, 400);

  const session = c.get("session");
  const sets  = [...keys.map((k) => `${k} = ?`), "updated_at = datetime('now')", "updated_by = ?"];
  const binds = [...keys.map((k) => sani.values[k]), session.account_id, slug];

  await c.env.DB.prepare(`UPDATE programs SET ${sets.join(", ")} WHERE slug = ?`).bind(...binds).run();

  // Keep live runs in step with the program's dates: editing the program's
  // registration/session window re-syncs any run that isn't historical.
  // Ended/archived runs stay frozen as a record of how that run actually ran.
  const COHORT_DATE_MAP = {
    registration_opens:  "enroll_opens",
    registration_closes: "enroll_closes",
    starts_on:           "starts_on",
    ends_on:             "ends_on",
  };
  // Run-priced programs manage dates per run (each option owns its window), so
  // the program's dates must NOT clobber them. Only legacy programs re-sync.
  const rp = await c.env.DB.prepare("SELECT enroll_by_run FROM programs WHERE slug = ? LIMIT 1").bind(slug).first();
  const dateSets = [], dateBinds = [];
  for (const [pk, ck] of Object.entries(COHORT_DATE_MAP)) {
    if (pk in sani.values) { dateSets.push(`${ck} = ?`); dateBinds.push(sani.values[pk]); }
  }
  if (dateSets.length && rp?.enroll_by_run !== 1) {
    await c.env.DB.prepare(
      `UPDATE cohorts SET ${dateSets.join(", ")} WHERE program_slug = ? AND status NOT IN ('ended', 'archived')`
    ).bind(...dateBinds, slug).run();
  }

  await recordAudit(c.env, session.account_id, "program.update", {
    type: "program", id: slug,
    payload: Object.fromEntries(
      keys.filter((k) => k !== "body_md" && k !== "pricing_json").map((k) => [k, sani.values[k]])
    ),
  });
  await stagePending(c, "program", slug, "update");

  return c.json({ ok: true });
});

admin.delete("/programs/:slug", async (c) => {
  const slug   = c.req.param("slug");
  const before = await c.env.DB.prepare("SELECT slug, title FROM programs WHERE slug = ?").bind(slug).first();
  if (!before) return c.json({ error: "Program not found." }, 404);

  await c.env.DB.prepare("DELETE FROM programs WHERE slug = ?").bind(slug).run();

  const session = c.get("session");
  await recordAudit(c.env, session.account_id, "program.delete", {
    type: "program", id: slug, payload: { title: before.title },
  });
  await stagePending(c, "program", slug, "delete");

  return c.json({ ok: true });
});

// DB row -> the shape the admin client edits. `pricing` is the parsed
// {selection,choices} object (null = option-less). `withBody` keeps body_md.
function normaliseProgramRow(r, { withBody = false } = {}) {
  let pricing = null;
  try { pricing = r.pricing_json ? JSON.parse(r.pricing_json) : null; } catch { pricing = null; }
  return {
    slug:                r.slug,
    title:               r.title,
    category:            r.category || "",
    registration_status: r.registration_status || "closed",
    registration_opens:  r.registration_opens || null,
    registration_closes: r.registration_closes || null,
    schedule_label:      r.schedule_label || "",
    starts_on:           r.starts_on || null,
    ends_on:             r.ends_on || null,
    price_label:         r.price_label || "",
    fee_amount:          r.fee_amount ?? null,
    pricing,
    tagline:             r.tagline || "",
    eyebrow:             r.eyebrow || "",
    image:               r.image || "",
    audience:            r.audience || "",
    duration:            r.duration || "",
    format:              r.format || "",
    outcome:             r.outcome || "",
    level:               r.level || "",
    meta_description:    r.meta_description || "",
    home_order:          r.home_order || "",
    register_url:        r.register_url || "",
    register_label:      r.register_label || "",
    hidden:              r.hidden === 1,
    repeatable:          r.repeatable === 1,
    always_open:         r.always_open === 1,
    enroll_by_run:       r.enroll_by_run === 1,
    pick_one:            r.pick_one === 1,
    published:           r.published === 1,
    updated_at:          r.updated_at,
    updated_by:          r.updated_by || null,
    ...(withBody ? { body_md: r.body_md || "" } : {}),
  };
}

// Validate + coerce editor input to column values. In `partial` mode only
// provided keys are returned. Returns { values } or { error }. Prices and
// fees are validated hard - this is the money path.
function sanitiseProgramInput(input, { partial = false } = {}) {
  const v = {};
  const has = (k) => (k in input) || !partial;

  if (has("title"))    v.title = trimOrNull(input.title);
  if (has("category")) {
    const cat = trimOrNull(input.category);
    if (cat && !PROGRAM_CATEGORIES.includes(cat)) {
      return { error: `category must be one of: ${PROGRAM_CATEGORIES.join(", ")}` };
    }
    v.category = cat;
  }
  if (has("registration_status")) {
    const s = trimOrNull(input.registration_status) || "closed";
    if (!REGISTRATION_STATUSES.includes(s)) {
      return { error: `registration_status must be one of: ${REGISTRATION_STATUSES.join(", ")}` };
    }
    v.registration_status = s;
  }
  for (const k of [
    "registration_opens", "registration_closes", "schedule_label", "starts_on", "ends_on",
    "price_label", "tagline", "eyebrow", "image", "audience", "duration", "format", "outcome", "level",
    "meta_description", "home_order", "register_url", "register_label",
  ]) {
    if (has(k)) v[k] = trimOrNull(input[k]);
  }
  if (has("body_md")) v.body_md = typeof input.body_md === "string" ? input.body_md : "";

  if (has("fee_amount")) {
    const f = input.fee_amount;
    if (f == null || f === "") v.fee_amount = null;
    else {
      const num = Number(f);
      if (!Number.isInteger(num) || num < 0) return { error: "fee_amount must be a non-negative whole number or empty." };
      v.fee_amount = num;
    }
  }
  if ("pricing" in input || (!partial)) {
    const res = sanitisePricing(input.pricing ?? null);
    if (res.error) return { error: res.error };
    v.pricing_json = res.json;
  }
  for (const k of ["hidden", "repeatable", "always_open", "enroll_by_run", "pick_one", "published"]) {
    if (has(k)) v[k] = input[k] ? 1 : 0;
  }
  return { values: v };
}

// Validate the priced-choices object -> JSON string (or null). Hard checks:
// selection enum, non-empty unique slug ids, non-empty labels, non-negative
// integer prices.
function sanitisePricing(pricing) {
  if (pricing == null) return { json: null };
  if (typeof pricing !== "object") return { error: "pricing must be an object or null." };
  if (pricing.selection !== "single" && pricing.selection !== "multiple") {
    return { error: "pricing.selection must be 'single' or 'multiple'." };
  }
  if (!Array.isArray(pricing.choices) || pricing.choices.length === 0) {
    return { error: "pricing needs at least one choice." };
  }
  const seen = new Set();
  const choices = [];
  for (const ch of pricing.choices) {
    const id = trimOrNull(ch && ch.id);
    if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      return { error: `choice id "${ch && ch.id}" must be lowercase letters/numbers/hyphens.` };
    }
    if (seen.has(id)) return { error: `duplicate choice id "${id}".` };
    seen.add(id);
    const label = trimOrNull(ch.label);
    if (!label) return { error: `choice "${id}" needs a label.` };
    const price = Number(ch.price);
    if (!Number.isInteger(price) || price < 0) {
      return { error: `choice "${id}" price must be a non-negative whole number.` };
    }
    choices.push({ id, label, note: trimOrNull(ch.note) || "", price });
  }
  return { json: JSON.stringify({ selection: pricing.selection, choices }) };
}

// ─── Press mentions (homepage collage + /media) ───────────────────────────
// D1 is the source of truth; rows materialize to content/data/press.json.
// Was the hand-edited public/data/media.json + hardcoded media.astro. Mirrors
// the Programs routes; integer id (not slug) since press rows have no page.
// Generic CRUD for the "dataset" content entities (press / hall-of-fame / team):
// list (+filter +published summary), get-one, create, update, delete - all
// materialize to content/*.json via stagePending. They differ only by table,
// field sanitiser/normaliser, list filter/order, required fields, and audit/stage
// labels, so one factory registers all five routes per entity.
function registerDatasetCrud(admin, opts) {
  const {
    path, table, normalise, sanitise, listFilter, listOrder, listLimit = 200,
    required = [], requiredMsg, labelField, createPayload,
    auditType, auditPrefix, stageEntity, notFound,
  } = opts;

  admin.get(`/${path}`, async (c) => {
    const { wheres, binds } = listFilter ? listFilter(c) : { wheres: [], binds: [] };
    const whereSql = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";
    const list = await c.env.DB.prepare(
      `SELECT * FROM ${table} ${whereSql} ${listOrder} LIMIT ${listLimit}`
    ).bind(...binds).all();
    const summary = await c.env.DB.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN published = 1 THEN 1 ELSE 0 END) AS published,
              SUM(CASE WHEN published = 0 THEN 1 ELSE 0 END) AS drafts
       FROM ${table}`
    ).first();
    return c.json({
      ok: true,
      rows: (list.results || []).map(normalise),
      summary: {
        total: Number(summary?.total) || 0,
        published: Number(summary?.published) || 0,
        drafts: Number(summary?.drafts) || 0,
      },
    });
  });

  admin.get(`/${path}/:id`, async (c) => {
    const row = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ? LIMIT 1`)
      .bind(c.req.param("id")).first();
    if (!row) return c.json({ error: notFound }, 404);
    return c.json({ ok: true, item: normalise(row) });
  });

  admin.post(`/${path}`, async (c) => {
    const sani = sanitise(await c.req.json());
    if (sani.error) return c.json({ error: sani.error }, 400);
    if (required.length && !required.every((k) => sani.values[k])) {
      return c.json({ error: requiredMsg }, 400);
    }
    const session = c.get("session");
    const keys = Object.keys(sani.values);
    const cols = [...keys, "updated_by"];
    const ph = [...keys.map(() => "?"), "?"];
    const binds = [...keys.map((k) => sani.values[k]), session.account_id];
    const res = await c.env.DB.prepare(
      `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${ph.join(", ")})`
    ).bind(...binds).run();
    const id = res.meta?.last_row_id;
    await recordAudit(c.env, session.account_id, `${auditPrefix}.create`, {
      type: auditType, id: String(id), payload: createPayload ? createPayload(sani.values) : {},
    });
    await stagePending(c, stageEntity, id, "create");
    return c.json({ ok: true, id });
  });

  admin.patch(`/${path}/:id`, async (c) => {
    const id = c.req.param("id");
    const before = await c.env.DB.prepare(`SELECT id FROM ${table} WHERE id = ? LIMIT 1`).bind(id).first();
    if (!before) return c.json({ error: notFound }, 404);
    const sani = sanitise(await c.req.json(), { partial: true });
    if (sani.error) return c.json({ error: sani.error }, 400);
    const keys = Object.keys(sani.values);
    if (keys.length === 0) return c.json({ error: "No editable fields provided." }, 400);
    const session = c.get("session");
    const sets = [...keys.map((k) => `${k} = ?`), "updated_by = ?"];
    const binds = [...keys.map((k) => sani.values[k]), session.account_id, id];
    await c.env.DB.prepare(`UPDATE ${table} SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();
    await recordAudit(c.env, session.account_id, `${auditPrefix}.update`, {
      type: auditType, id: String(id), payload: Object.fromEntries(keys.map((k) => [k, sani.values[k]])),
    });
    await stagePending(c, stageEntity, id, "update");
    return c.json({ ok: true });
  });

  admin.delete(`/${path}/:id`, async (c) => {
    const id = c.req.param("id");
    const before = await c.env.DB.prepare(`SELECT ${labelField} FROM ${table} WHERE id = ?`).bind(id).first();
    if (!before) return c.json({ error: notFound }, 404);
    await c.env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
    const session = c.get("session");
    await recordAudit(c.env, session.account_id, `${auditPrefix}.delete`, {
      type: auditType, id: String(id), payload: { [labelField]: before[labelField] },
    });
    await stagePending(c, stageEntity, id, "delete");
    return c.json({ ok: true });
  });
}

const datasetStatusFilter = (c) => {
  const status = c.req.query("status");
  const wheres = [];
  if (status === "published") wheres.push("published = 1");
  else if (status === "draft") wheres.push("published = 0");
  return { wheres, binds: [] };
};
const datasetSectionFilter = (c) => {
  const section = c.req.query("section");
  const wheres = [], binds = [];
  if (section) { wheres.push("section = ?"); binds.push(section); }
  return { wheres, binds };
};

function normalisePressRow(r) {
  return {
    id: r.id,
    outlet: r.outlet,
    title: r.title,
    url: r.url,
    published_on: r.published_on || "",
    image: r.image || "",
    featured: r.featured === 1,
    sort_order: r.sort_order ?? 0,
    published: r.published === 1,
    updated_at: r.updated_at,
    updated_by: r.updated_by || null,
  };
}

function sanitisePressInput(input, { partial = false } = {}) {
  const v = {};
  const has = (k) => (k in input) || !partial;
  if (has("outlet")) v.outlet = trimOrNull(input.outlet);
  if (has("title")) v.title = trimOrNull(input.title);
  if (has("url")) v.url = trimOrNull(input.url);
  if (has("published_on")) v.published_on = trimOrNull(input.published_on);
  if (has("image")) v.image = trimOrNull(input.image);
  if (has("sort_order")) {
    const n = Number(input.sort_order);
    v.sort_order = Number.isFinite(n) ? Math.trunc(n) : 0;
  }
  for (const k of ["featured", "published"]) if (has(k)) v[k] = input[k] ? 1 : 0;
  return { values: v };
}

registerDatasetCrud(admin, {
  path: "press-mentions", table: "press_mentions",
  normalise: normalisePressRow, sanitise: sanitisePressInput,
  listFilter: datasetStatusFilter, listOrder: "ORDER BY featured DESC, sort_order ASC, id ASC",
  required: ["outlet", "title", "url"], requiredMsg: "Outlet, title, and URL are required.",
  labelField: "title", createPayload: (v) => ({ title: v.title }),
  auditType: "press_mention", auditPrefix: "press", stageEntity: "press",
  notFound: "Press mention not found.",
});

// ─── Hall of Fame photos (homepage slider) ────────────────────────────────
// Materializes to content/data/halloffame.json. Was public/data/results.json.
function normaliseHofRow(r) {
  return {
    id: r.id,
    image: r.image,
    caption: r.caption || "",
    year: r.year || "",
    sort_order: r.sort_order ?? 0,
    published: r.published === 1,
    updated_at: r.updated_at,
    updated_by: r.updated_by || null,
  };
}

function sanitiseHofInput(input, { partial = false } = {}) {
  const v = {};
  const has = (k) => (k in input) || !partial;
  if (has("image")) v.image = trimOrNull(input.image);
  if (has("caption")) v.caption = trimOrNull(input.caption);
  if (has("year")) v.year = trimOrNull(input.year);
  if (has("sort_order")) {
    const n = Number(input.sort_order);
    v.sort_order = Number.isFinite(n) ? Math.trunc(n) : 0;
  }
  if (has("published")) v.published = input.published ? 1 : 0;
  return { values: v };
}

registerDatasetCrud(admin, {
  path: "hall-of-fame", table: "hall_of_fame_photos",
  normalise: normaliseHofRow, sanitise: sanitiseHofInput,
  listFilter: datasetStatusFilter, listOrder: "ORDER BY sort_order ASC, id ASC",
  required: ["image"], requiredMsg: "An image is required.",
  labelField: "caption", createPayload: (v) => ({ caption: v.caption }),
  auditType: "hall_of_fame_photo", auditPrefix: "halloffame", stageEntity: "halloffame",
  notFound: "Photo not found.",
});

// ─── Team members (/team page) ─────────────────────────────────────────────
// Materializes to content/data/team.json. Was hardcoded in team.astro.
const TEAM_SECTIONS = ["delegation", "advisor", "organizing", "mentor", "alumni"];

function normaliseTeamRow(r) {
  return {
    id: r.id,
    section: r.section,
    subgroup: r.subgroup || "",
    year: r.year || "",
    name: r.name,
    role: r.role || "",
    affiliation: r.affiliation || "",
    image: r.image || "",
    sort_order: r.sort_order ?? 0,
    published: r.published === 1,
    updated_at: r.updated_at,
  };
}

function sanitiseTeamInput(input, { partial = false } = {}) {
  const v = {};
  const has = (k) => (k in input) || !partial;
  if (has("section")) {
    const s = trimOrNull(input.section);
    if (s && !TEAM_SECTIONS.includes(s)) return { error: `section must be one of: ${TEAM_SECTIONS.join(", ")}` };
    v.section = s;
  }
  for (const k of ["subgroup", "year", "name", "role", "affiliation", "image"]) {
    if (has(k)) v[k] = trimOrNull(input[k]);
  }
  if (has("sort_order")) {
    const n = Number(input.sort_order);
    v.sort_order = Number.isFinite(n) ? Math.trunc(n) : 0;
  }
  if (has("published")) v.published = input.published ? 1 : 0;
  return { values: v };
}

registerDatasetCrud(admin, {
  path: "team", table: "team_members",
  normalise: normaliseTeamRow, sanitise: sanitiseTeamInput,
  listFilter: datasetSectionFilter, listOrder: "ORDER BY section ASC, sort_order ASC, id ASC", listLimit: 500,
  required: ["section", "name"], requiredMsg: "Section and name are required.",
  labelField: "name", createPayload: (v) => ({ name: v.name, section: v.section }),
  auditType: "team_member", auditPrefix: "team", stageEntity: "team",
  notFound: "Team member not found.",
});

// ─── Publish (review + single-commit) ──────────────────────────────────────
// Content edits stage pending_publish rows (see stagePending). These endpoints
// review, commit (one GitHub commit), or discard the staged set.

const PENDING_LABELS = {
  post: "post", program: "program", press: "press update",
  halloffame: "Hall of Fame update", medalist: "medalists update", team: "team update",
};

// GET /api/admin/publish/pending - list everything waiting to be published.
admin.get("/publish/pending", async (c) => {
  const rows = (await c.env.DB.prepare(
    "SELECT id, entity_type, entity_id, action, materialized_path, staged_at FROM pending_publish WHERE status = 'pending' ORDER BY staged_at ASC"
  ).all()).results || [];

  const changes = [];
  for (const r of rows) {
    changes.push({
      id: r.id,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      action: r.action,
      title: await titleFor(c.env, r.entity_type, r.entity_id),
      path: r.materialized_path,
      staged_at: r.staged_at,
      // Which fields changed since last publish (updates only; [] otherwise).
      changed: await diffEntityFields(c.env, r.entity_type, r.entity_id, r.action),
    });
  }

  // Suggested commit message describes WHAT changed, grouped by type, e.g.
  // "Update 2 programs: Mock Test (price, schedule), STEM Masterclass (body)".
  const byType = {};
  for (const ch of changes) {
    const label = PENDING_LABELS[ch.entity_type] || ch.entity_type;
    const desc = ch.changed && ch.changed.length ? `${ch.title} (${ch.changed.map((d) => d.field).join(", ")})` : ch.title;
    (byType[label] ??= []).push(desc);
  }
  const parts = Object.entries(byType).map(([label, items]) =>
    `${items.length} ${label}${items.length > 1 && !label.includes(" ") ? "s" : ""}: ${items.join(", ")}`
  );
  // Conventional-commit style so the published GitHub history stays consistent.
  const suggestedMessage = parts.length ? `chore(content): update ${parts.join("; ")}` : "chore(content): publish content changes";

  return c.json({ ok: true, count: rows.length, changes, suggestedMessage });
});

// POST /api/admin/publish - materialize all pending rows from CURRENT D1 state
// and commit them in ONE GitHub commit. Marks the set published on success.
admin.post("/publish", async (c) => {
  let message = "";
  try { message = (await c.req.json())?.message || ""; } catch {}

  const rows = (await c.env.DB.prepare(
    "SELECT id, entity_type, entity_id, action FROM pending_publish WHERE status = 'pending' ORDER BY staged_at ASC"
  ).all()).results || [];
  if (rows.length === 0) return c.json({ error: "Nothing to publish." }, 400);

  // Re-materialize from D1 now (authoritative) so the commit reflects the very
  // latest state, not whatever was cached at stage time.
  const files = [];
  const seenPaths = new Set();
  for (const r of rows) {
    const mat = await materializeEntity(c.env, r.entity_type, r.entity_id, r.action);
    const path = mat ? mat.path : pathFor(r.entity_type, r.entity_id);
    if (!path || seenPaths.has(path)) continue;
    seenPaths.add(path);
    files.push({ path, content: mat ? mat.content : null });
  }

  const session = c.get("session");
  const finalMessage = message.trim() || `Publish ${rows.length} content change${rows.length > 1 ? "s" : ""}`;

  let result;
  try {
    result = await publishFiles(c.env, files, finalMessage);
  } catch (err) {
    return c.json({ error: `Publish failed: ${err.message}` }, 502);
  }

  await c.env.DB.prepare(
    "UPDATE pending_publish SET status = 'published', updated_at = datetime('now') WHERE status = 'pending'"
  ).run();

  // Record the just-committed D1 state as each entity's revert baseline so a
  // later discard can roll back to it. Best-effort: never fail the publish.
  for (const r of rows) {
    // Best-effort: never fail the publish. But surface failures - a swallowed
    // error here leaves the entity with no discard baseline, so log which
    // entity lost its snapshot.
    try { await captureSnapshot(c.env, r.entity_type, r.entity_id); }
    catch (err) { console.log(`[publish] snapshot failed for ${r.entity_type}#${r.entity_id}:`, err?.message || err); }
  }

  await recordAudit(c.env, session.account_id, "publish.commit", {
    type: "publish", id: result.commit,
    payload: { commit: result.commit, files: result.files, message: finalMessage },
  });

  return c.json({ ok: true, commit: result.commit, files: result.files });
});

// POST /api/admin/publish/discard - revert each pending entity's D1 state to
// its last-published baseline (snapshot), then drop the pending rows. Entities
// edited before any publish-through-this-system have no baseline; those are
// reported as skipped rather than risk wiping live content.
admin.post("/publish/discard", async (c) => {
  const rows = (await c.env.DB.prepare(
    "SELECT entity_type, entity_id, action FROM pending_publish WHERE status = 'pending'"
  ).all()).results || [];

  let reverted = 0, skipped = 0;
  for (const r of rows) {
    try {
      const outcome = await restoreSnapshot(c.env, r.entity_type, r.entity_id, r.action);
      if (outcome === "skipped") skipped++; else reverted++;
    } catch {
      skipped++;
    }
  }

  await c.env.DB.prepare("DELETE FROM pending_publish WHERE status = 'pending'").run();

  const session = c.get("session");
  await recordAudit(c.env, session.account_id, "publish.discard", {
    type: "publish", id: "discard", payload: { discarded: rows.length, reverted, skipped },
  });

  return c.json({ ok: true, discarded: rows.length, reverted, skipped });
});

export default admin;
