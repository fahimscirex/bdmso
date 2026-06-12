// Admin-tier endpoints - mounted under /api/admin/*. Role-gated to admin
// only at the namespace level.
//
// Mutating handlers should call recordAudit(env, session.account_id, "...", {...})
// after a successful change so the action shows up in admin_audit_log.

import { Hono } from "hono";
import { sessionMiddleware } from "../middleware/session.js";
import { requireRole } from "../middleware/requireRole.js";
import { recordAudit } from "../lib/audit-log.js";
import { PROGRAM_NAMES } from "../lib/programs.js";
import { createVerificationToken, sendVerificationEmail, assignMemberIdAndSendReceipt, sendBroadcastEmail } from "../lib/email.js";
import { getBaseUrl } from "../lib/util.js";
import { checkActionRateLimit, recordActionAttempt, clientIpFor } from "../lib/rate-limit.js";
import { reconcilePayment, reconcileStalePayments } from "../lib/reconcile.js";

const admin = new Hono();

admin.use("*", sessionMiddleware);
admin.use("*", requireRole("admin"));
// Per-IP cap across the entire admin namespace. Admins make a lot of
// requests (dashboard list views, broadcast composer polls), but 200
// per 15 minutes is well above any human workflow and stops a
// credential-stuffed admin token from being used to scrape data fast.
admin.use("*", async (c, next) => {
  const ip = clientIpFor(c.req.raw);
  if (!(await checkActionRateLimit(c.env, "admin-ip", ip, 200, 15 * 60 * 1000))) {
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
admin.get("/registrations", async (c) => {
  const status = c.req.query("status");
  const type   = c.req.query("type");
  const q      = c.req.query("q");
  const limit  = Math.min(Number(c.req.query("limit")) || 200, 1000);

  const wheres = [];
  const binds  = [];
  if (status) { wheres.push("r.status = ?");            binds.push(status); }
  if (type)   { wheres.push("r.registration_type = ?"); binds.push(type); }
  if (q) {
    // Free-text search across the name/contact fields an organiser would
    // actually type to find one family.
    wheres.push("(r.student_full_name LIKE ? OR r.guardian_full_name LIKE ? OR r.guardian_email LIKE ? OR r.guardian_phone LIKE ? OR r.student_school LIKE ?)");
    const like = `%${q}%`;
    binds.push(like, like, like, like, like);
  }
  const whereSql = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";

  const rows = await c.env.DB.prepare(`
    SELECT
      r.id,
      r.registration_type,
      r.student_full_name,
      r.student_class_name,
      r.student_gender,
      r.student_school,
      r.student_district,
      r.preferred_venue,
      r.guardian_full_name,
      r.guardian_email,
      r.guardian_phone,
      r.status,
      r.created_at,
      p.status     AS payment_status,
      p.amount     AS payment_amount,
      p.tran_id    AS payment_tran_id,
      p.updated_at AS payment_updated_at
    FROM registrations r
    LEFT JOIN payments p ON p.id = (
      SELECT id FROM payments WHERE registration_id = r.id ORDER BY created_at DESC LIMIT 1
    )
    ${whereSql}
    ORDER BY r.created_at DESC
    LIMIT ?
  `).bind(...binds, limit).all();

  // Summary counts - useful for the list header. Single round-trip via a
  // separate batched query so the main rows don't carry repeated totals.
  const summary = await c.env.DB.prepare(`
    SELECT
      COUNT(*)                                                   AS total,
      SUM(CASE WHEN status = 'paid'      THEN 1 ELSE 0 END)      AS paid,
      SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END)      AS pending,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)      AS cancelled
    FROM registrations
  `).first();

  // Attach the catalog-derived program label so the admin UI doesn't
  // keep its own copy of program names.
  const enriched = (rows.results || []).map((r) => ({
    ...r,
    program_label: PROGRAM_NAMES[r.registration_type] || r.registration_type,
  }));

  return c.json({
    ok: true,
    rows: enriched,
    summary: {
      total:     Number(summary?.total)     || 0,
      paid:      Number(summary?.paid)      || 0,
      pending:   Number(summary?.pending)   || 0,
      cancelled: Number(summary?.cancelled) || 0,
    },
    filter: { status: status || null, type: type || null, q: q || null, limit },
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

  const payments = await c.env.DB.prepare(
    "SELECT * FROM payments WHERE registration_id = ? ORDER BY created_at DESC"
  ).bind(id).all();

  return c.json({ ok: true, registration: reg, payments: payments.results });
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

  const session = c.get("session");
  await recordAudit(c.env, session.account_id, "registration.update_status", {
    type: "registration",
    id,
    payload: { from: before.status, to: status },
  });

  return c.json({ ok: true, id, status });
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

// POST /api/admin/registrations/:id/resend-receipt
// Re-sends the payment receipt for a paid registration. Reuses
// assignMemberIdAndSendReceipt, which is idempotent on the member-id mint.
admin.post("/registrations/:id/resend-receipt", async (c) => {
  const id = c.req.param("id");
  const reg = await c.env.DB.prepare(
    "SELECT id FROM registrations WHERE id = ? LIMIT 1"
  ).bind(id).first();
  if (!reg) return c.json({ error: "Registration not found." }, 404);

  const payment = await c.env.DB.prepare(
    "SELECT tran_id FROM payments WHERE registration_id = ? AND status = 'paid' ORDER BY updated_at DESC LIMIT 1"
  ).bind(id).first();
  if (!payment) return c.json({ error: "No paid payment on this registration - nothing to receipt." }, 400);

  await assignMemberIdAndSendReceipt(c.env, payment.tran_id, getBaseUrl(c.req.raw));

  const session = c.get("session");
  await recordAudit(c.env, session.account_id, "registration.resend_receipt", {
    type: "registration", id, payload: { tran_id: payment.tran_id },
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
      p.status, p.coupon_code, p.created_at, p.updated_at,
      r.id                AS registration_id,
      r.registration_type,
      r.student_full_name,
      r.guardian_full_name,
      r.guardian_email
    FROM payments p
    LEFT JOIN registrations r ON r.id = p.registration_id
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
// Re-verifies a single pending payment against ShurjoPay and marks it
// paid or failed.  Only works on payments with status = 'pending'.
admin.post("/payments/:id/reconcile", async (c) => {
  const id = c.req.param("id");
  const payment = await c.env.DB.prepare(
    "SELECT id, tran_id, val_id, amount, registration_id, status, coupon_code, purpose, proposed_options FROM payments WHERE id = ? LIMIT 1"
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
      payment_id: payment.id, tran_id: payment.tran_id, ...result,
    });
    return c.json({ ok: true, ...result });
  } catch (err) {
    return c.json({ error: `Reconciliation failed: ${err.message}` }, 502);
  }
});

// POST /api/admin/payments/reconcile-stale
// Bulk-reconcile all pending payments older than 30 minutes.
admin.post("/payments/reconcile-stale", async (c) => {
  try {
    const result = await reconcileStalePayments(c.env, getBaseUrl(c.req.raw));
    const session = c.get("session");
    await recordAudit(c.env, session.account_id, "payment.reconcile_bulk", result);
    return c.json({ ok: true, ...result });
  } catch (err) {
    return c.json({ error: `Bulk reconciliation failed: ${err.message}` }, 502);
  }
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
// Returns { url, key, size, type }. `url` is the public path the
// renderer can drop into an <img src>; it's served from the same origin
// at /r2/<key> so it stays under our CSP.
//
// Orphan files (uploaded then never referenced) are tolerated for now -
// cheap on R2, easy to sweep later if it ever matters.

const ALLOWED_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png":  "png",
  "image/webp": "webp",
  "image/gif":  "gif",
  "image/svg+xml": "svg",
};
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;   // 10 MB - cover-image sized.

admin.post("/uploads", async (c) => {
  if (!c.env.ASSETS_R2) {
    return c.json({ error: "R2 bucket binding ASSETS_R2 is not configured." }, 500);
  }

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

  await c.env.ASSETS_R2.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  const session = c.get("session");
  await recordAudit(c.env, session.account_id, "upload.create", {
    type: "upload", id: key, payload: { size: file.size, type: file.type },
  });

  return c.json({
    ok: true,
    url:  `/r2/${key}`,
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

  const wheres = [];
  const binds  = [];
  if (action)     { wheres.push("l.action LIKE ?");    binds.push(`%${action}%`); }
  if (targetType) { wheres.push("l.target_type = ?");  binds.push(targetType); }
  if (targetId)   { wheres.push("l.target_id = ?");    binds.push(targetId); }
  if (accountId)  { wheres.push("l.account_id = ?");   binds.push(accountId); }
  const whereSql = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";

  const rows = await c.env.DB.prepare(`
    SELECT
      l.id, l.account_id, l.action, l.target_type, l.target_id,
      l.payload_json, l.created_at,
      a.email AS account_email
    FROM admin_audit_log l
    LEFT JOIN guardian_accounts a ON a.id = l.account_id
    ${whereSql}
    ORDER BY l.created_at DESC
    LIMIT ?
  `).bind(...binds, limit).all();

  return c.json({
    ok: true,
    rows: rows.results,
    filter: {
      action:      action     || null,
      target_type: targetType || null,
      target_id:   targetId   || null,
      account_id:  accountId  || null,
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
  const funnel = await c.env.DB.prepare(`
    SELECT
      COUNT(*)                                                AS total,
      SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END)   AS submitted,
      SUM(CASE WHEN status = 'paid'      THEN 1 ELSE 0 END)   AS paid,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)   AS cancelled
    FROM registrations
  `).first();

  const byVenue = await c.env.DB.prepare(`
    SELECT COALESCE(NULLIF(TRIM(preferred_venue), ''), 'Not set') AS venue,
           COUNT(*)                                          AS total,
           SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END)  AS paid
    FROM registrations
    GROUP BY venue
    ORDER BY total DESC
  `).all();

  const byProgram = await c.env.DB.prepare(`
    SELECT registration_type,
           COUNT(*)                                          AS total,
           SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END)  AS paid
    FROM registrations
    GROUP BY registration_type
    ORDER BY total DESC
  `).all();

  const revenue = await c.env.DB.prepare(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'paid'"
  ).first();

  return c.json({
    ok: true,
    funnel: {
      total:     Number(funnel?.total)     || 0,
      submitted: Number(funnel?.submitted) || 0,
      paid:      Number(funnel?.paid)      || 0,
      cancelled: Number(funnel?.cancelled) || 0,
    },
    byVenue: (byVenue.results || []).map((r) => ({
      venue: r.venue, total: Number(r.total), paid: Number(r.paid),
    })),
    byProgram: (byProgram.results || []).map((r) => ({
      type:  r.registration_type,
      label: PROGRAM_NAMES[r.registration_type] || r.registration_type,
      total: Number(r.total),
      paid:  Number(r.paid),
    })),
    revenue: Number(revenue?.total) || 0,
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

// GET /api/admin/broadcast/recipients?program=&venue=&status=
// How many distinct guardians a broadcast with these filters would reach.
admin.get("/broadcast/recipients", async (c) => {
  const { whereSql, binds } = broadcastFilters({
    program: c.req.query("program"),
    venue:   c.req.query("venue"),
    status:  c.req.query("status"),
  });
  const row = await c.env.DB.prepare(`
    SELECT COUNT(DISTINCT a.email) AS n
    FROM registrations r
    JOIN guardian_accounts a ON a.id = r.guardian_account_id
    ${whereSql}
  `).bind(...binds).first();
  return c.json({ ok: true, count: Number(row?.n) || 0 });
});

// POST /api/admin/broadcast  { subject, message, program?, venue?, status? }
admin.post("/broadcast", async (c) => {
  const body    = await c.req.json();
  const subject = (body.subject || "").trim();
  const message = (body.message || "").trim();
  if (!subject) return c.json({ error: "Subject is required." }, 400);
  if (!message) return c.json({ error: "Message is required." }, 400);

  const { whereSql, binds } = broadcastFilters(body);
  const rows = await c.env.DB.prepare(`
    SELECT DISTINCT a.email
    FROM registrations r
    JOIN guardian_accounts a ON a.id = r.guardian_account_id
    ${whereSql}
  `).bind(...binds).all();
  const recipients = (rows.results || []).map((r) => r.email).filter(Boolean);
  if (recipients.length === 0) {
    return c.json({ error: "No guardians match those filters - nothing to send." }, 400);
  }

  const result = await sendBroadcastEmail(c.env, { subject, message, recipients });

  const session = c.get("session");
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

export default admin;
