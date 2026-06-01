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
import { getShurjopayConfig, shurjopayGetToken, shurjopayVerify } from "../lib/shurjopay.js";
import { createVerificationToken, sendVerificationEmail, createPasswordResetToken, sendPasswordResetEmail, assignMemberIdAndSendReceipt, sendBroadcastEmail } from "../lib/email.js";
import { getBaseUrl } from "../lib/util.js";
import { checkActionRateLimit, recordActionAttempt, clientIpFor } from "../lib/rate-limit.js";

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
        r.guardian_full_name,
        r.guardian_email,
        r.guardian_phone,
        r.status,
        r.created_at,
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
      LEFT JOIN payments p ON p.id = (
        SELECT id FROM payments WHERE registration_id = r.id ORDER BY created_at DESC LIMIT 1
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

// POST /api/admin/payments/:id/reverify
// Re-fetches the transaction status from shurjoPay and reconciles our local
// `payments.status` with whatever the gateway says. Useful when the IPN
// got dropped or the browser-return path was interrupted.
admin.post("/payments/:id/reverify", async (c) => {
  const id  = c.req.param("id");
  const row = await c.env.DB.prepare(
    "SELECT id, val_id, tran_id, status, registration_id, amount FROM payments WHERE id = ? LIMIT 1"
  ).bind(id).first();
  if (!row) return c.json({ error: "Payment not found." }, 404);
  if (!row.val_id) return c.json({ error: "No shurjoPay order id stored - can't re-verify." }, 400);

  const config = getShurjopayConfig(c.env);
  let verified;
  try {
    const tokenInfo = await shurjopayGetToken(config, c.env);
    verified = await shurjopayVerify(config, tokenInfo, row.val_id);
  } catch (err) {
    return c.json({ error: "shurjoPay verify call failed: " + (err?.message || "unknown") }, 502);
  }

  // Map gateway status to our internal status.
  const gatewayStatus = String(verified?.transaction_status || "").toLowerCase();
  const newStatus = gatewayStatus === "success" ? "paid"
                  : gatewayStatus === "cancel" || gatewayStatus === "cancelled" ? "cancelled"
                  : gatewayStatus === "fail" || gatewayStatus === "failed" ? "failed"
                  : null;

  if (!newStatus) {
    return c.json({ ok: true, gateway: verified, status_unchanged: true, message: `Gateway reported "${gatewayStatus}" - no status change.` });
  }

  const session = c.get("session");
  if (newStatus !== row.status) {
    await c.env.DB.prepare(
      "UPDATE payments SET status = ?, gateway_status = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(newStatus, gatewayStatus, id).run();
    if (newStatus === "paid" && row.registration_id) {
      await c.env.DB.prepare("UPDATE registrations SET status = 'paid' WHERE id = ?")
        .bind(row.registration_id).run();
    }
    await recordAudit(c.env, session.account_id, "payment.reverify", {
      type: "payment", id, payload: { from: row.status, to: newStatus, gateway: gatewayStatus },
    });
  }

  return c.json({ ok: true, status: newStatus, gateway: verified });
});

// POST /api/admin/payments/:id/refund
// Marks a paid payment as refunded internally. NOTE: this does NOT call the
// shurjoPay refund API (gateway-side refunds must be initiated from the
// shurjoPay merchant dashboard until that integration is added). The
// internal flag + status flip-back unblocks the guardian from re-paying.
admin.post("/payments/:id/refund", async (c) => {
  const id   = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const note = (body.note || "").trim();
  const row  = await c.env.DB.prepare(
    "SELECT id, status, registration_id, amount, tran_id FROM payments WHERE id = ? LIMIT 1"
  ).bind(id).first();
  if (!row) return c.json({ error: "Payment not found." }, 404);
  if (row.status !== "paid") return c.json({ error: `Can only refund paid payments (this one is ${row.status}).` }, 409);

  const session = c.get("session");
  // Use 'failed' as the internal closed-out status so existing payment-state
  // logic continues to treat the row as not-paid. The audit log records the
  // intent ("refund") so this is distinguishable from a real failure.
  await c.env.DB.prepare(
    "UPDATE payments SET status = 'failed', gateway_status = 'AdminRefund', updated_at = datetime('now') WHERE id = ?"
  ).bind(id).run();
  if (row.registration_id) {
    await c.env.DB.prepare(
      "UPDATE registrations SET status = 'submitted' WHERE id = ? AND status = 'paid'"
    ).bind(row.registration_id).run();
  }

  await recordAudit(c.env, session.account_id, "payment.refund", {
    type: "payment", id, payload: { tran_id: row.tran_id, amount: row.amount, note: note || null },
  });

  return c.json({ ok: true, message: "Marked refunded internally. Remember to issue the actual refund via the shurjoPay merchant dashboard." });
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
  const catalog = await getCatalog(c);
  // All eight aggregates run in parallel - D1 latency dominates, so
  // sequential awaits would compound badly.
  const [
    funnel, byVenue, byProgram, revenue, deltas, regSeries, paySeries, attention, expiringCoupons,
  ] = await Promise.all([
    c.env.DB.prepare(`
      SELECT
        COUNT(*)                                                AS total,
        SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END)   AS submitted,
        SUM(CASE WHEN status = 'paid'      THEN 1 ELSE 0 END)   AS paid,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)   AS cancelled
      FROM registrations
    `).first(),
    c.env.DB.prepare(`
      SELECT COALESCE(NULLIF(TRIM(preferred_venue), ''), 'Not set') AS venue,
             COUNT(*)                                          AS total,
             SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END)  AS paid
      FROM registrations
      GROUP BY venue
      ORDER BY total DESC
    `).all(),
    c.env.DB.prepare(`
      SELECT registration_type,
             COUNT(*)                                          AS total,
             SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END)  AS paid
      FROM registrations
      GROUP BY registration_type
      ORDER BY total DESC
    `).all(),
    c.env.DB.prepare(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'paid'"
    ).first(),
    // Today vs yesterday deltas (registrations + paid + revenue).
    c.env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM registrations WHERE date(created_at) = date('now'))                                       AS reg_today,
        (SELECT COUNT(*) FROM registrations WHERE date(created_at) = date('now', '-1 day'))                             AS reg_yesterday,
        (SELECT COUNT(*) FROM registrations WHERE status='paid' AND date(created_at) = date('now'))                     AS paid_today,
        (SELECT COUNT(*) FROM registrations WHERE status='paid' AND date(created_at) = date('now', '-1 day'))           AS paid_yesterday,
        (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='paid' AND date(updated_at) = date('now'))           AS rev_today,
        (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='paid' AND date(updated_at) = date('now', '-1 day')) AS rev_yesterday
    `).first(),
    // Registrations per day, last 30 days. Client fills missing days with 0.
    c.env.DB.prepare(`
      SELECT date(created_at) AS day,
             COUNT(*)                                          AS total,
             SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END)    AS paid
      FROM registrations
      WHERE date(created_at) >= date('now', '-29 days')
      GROUP BY day
      ORDER BY day
    `).all(),
    // Revenue per day, last 30 days.
    c.env.DB.prepare(`
      SELECT date(updated_at) AS day,
             COUNT(*)                            AS count,
             COALESCE(SUM(amount), 0)            AS revenue
      FROM payments
      WHERE status='paid' AND date(updated_at) >= date('now', '-29 days')
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
      label: catalog.nameFor(r.registration_type),
      total: Number(r.total),
      paid:  Number(r.paid),
    })),
    revenue: Number(revenue?.total) || 0,
    deltas: {
      reg_today:       Number(deltas?.reg_today)       || 0,
      reg_yesterday:   Number(deltas?.reg_yesterday)   || 0,
      paid_today:      Number(deltas?.paid_today)      || 0,
      paid_yesterday:  Number(deltas?.paid_yesterday)  || 0,
      rev_today:       Number(deltas?.rev_today)       || 0,
      rev_yesterday:   Number(deltas?.rev_yesterday)   || 0,
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
  const filtersJson = JSON.stringify({ program: body.program || null, venue: body.venue || null, status: body.status || null });

  // Persist to broadcast_log so the history tab can show past sends.
  // Best-effort: a log-write failure doesn't fail the send.
  try {
    await c.env.DB.prepare(`
      INSERT INTO broadcast_log (subject, body, filters_json, recipient_count, sent_count, failed_count, channel, sent_by)
      VALUES (?, ?, ?, ?, ?, ?, 'email', ?)
    `).bind(subject, message, filtersJson, recipients.length, result.sent, result.failed, session.account_id).run();
  } catch { /* swallow - audit_log still captures it */ }

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
//   guardian. Idempotent in the sense that the same call sends again - no
//   "last reminded at" tracking yet.
admin.post("/registrations/bulk/remind", async (c) => {
  const body = await c.req.json();
  const ids  = Array.isArray(body.ids) ? body.ids.slice(0, 500) : [];
  if (ids.length === 0) return c.json({ error: "No registrations selected." }, 400);

  // Fetch guardian emails for each unpaid registration in the list.
  const placeholders = ids.map(() => "?").join(",");
  const rows = await c.env.DB.prepare(`
    SELECT DISTINCT r.guardian_email AS email, r.student_full_name AS student
    FROM registrations r
    WHERE r.id IN (${placeholders}) AND r.status = 'submitted'
      AND r.guardian_email IS NOT NULL AND r.guardian_email != ''
  `).bind(...ids).all();
  const recipients = (rows.results || []).map((r) => r.email);
  if (recipients.length === 0) {
    return c.json({ error: "No unpaid registrations matched the selection." }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const subject = "Reminder: complete your BdMSO registration payment";
  const message = `Hi,\n\nYou started registering for a BdMSO program but the payment isn't complete yet. To finish, please return to your dashboard and pay:\n\n${baseUrl}/dashboard\n\nIf you've already paid or no longer wish to participate, you can ignore this message.\n\nThanks,\nBdMSO Team`;

  const result = await sendBroadcastEmail(c.env, { subject, message, recipients });

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
      SELECT id, organization, contact_email, contact_phone, message, created_at
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
  const validHours = Number.isFinite(hours) && hours > 0 ? hours : 24;
  const session = c.get("session");

  await c.env.DB.prepare(`
    INSERT INTO triage_state (admin_account_id, target_kind, target_id, snoozed_until)
    VALUES (?, ?, ?, datetime('now', '+${validHours} hours'))
    ON CONFLICT(admin_account_id, target_kind, target_id)
    DO UPDATE SET snoozed_until = datetime('now', '+${validHours} hours'), resolved_at = NULL
  `).bind(session.account_id, kind, id).run();

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
      r2:           { ok: !!env.ASSETS_R2, hint: env.ASSETS_R2 ? "bucket bound" : "no binding" },
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
    return c.json({ error: err?.message || "Failed to save template." }, 500);
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
admin.get("/events", async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT event_key, COUNT(DISTINCT registration_id) AS rows
    FROM (
      SELECT event_key, registration_id FROM attendance
      UNION ALL
      SELECT event_key, registration_id FROM scores
    )
    GROUP BY event_key
    ORDER BY event_key
  `).all();
  return c.json({
    ok: true,
    rows: (rows.results || []).map((r) => ({ event_key: r.event_key, rows: Number(r.rows) || 0 })),
  });
});

// GET /api/admin/events/:event/roster?venue=&class=
admin.get("/events/:event/roster", async (c) => {
  const catalog = await getCatalog(c);
  const event_key = c.req.param("event");
  const venue = c.req.query("venue");
  const klass = c.req.query("class");

  const wheres = ["r.status = 'paid'"];
  const binds  = [];
  if (venue) { wheres.push("r.preferred_venue = ?");    binds.push(venue); }
  if (klass) { wheres.push("r.student_class_name = ?"); binds.push(klass); }
  const whereSql = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";

  const rows = await c.env.DB.prepare(`
    SELECT r.id, r.student_full_name, r.student_class_name, r.student_gender,
           r.student_school, r.student_district, r.preferred_venue,
           r.registration_type,
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

  return c.json({
    ok: true,
    event_key, venue: venue || null, class: klass || null,
    rows: (rows.results || []).map((r) => ({
      ...r,
      program_label: catalog.nameFor(r.registration_type),
      attendance_status: r.attendance_status || "absent",
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

// GET /api/admin/events/:event/scores?section=
admin.get("/events/:event/scores", async (c) => {
  const event_key = c.req.param("event");
  const section = c.req.query("section");
  const wheres = ["s.event_key = ?"];
  const binds = [event_key];
  if (section) { wheres.push("s.section = ?"); binds.push(section); }

  const rows = await c.env.DB.prepare(`
    SELECT s.id, s.registration_id, s.section, s.score, s.max_score, s.rank, s.tier,
           r.student_full_name, r.student_class_name, r.preferred_venue
    FROM scores s
    JOIN registrations r ON r.id = s.registration_id
    WHERE ${wheres.join(" AND ")}
    ORDER BY s.section, s.score DESC
    LIMIT 5000
  `).bind(...binds).all();

  return c.json({ ok: true, event_key, section: section || null, rows: rows.results || [] });
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

  // Apply ranks + tiers. Concurrent finalize calls would race; the audit
  // log will record both. For our scale (sub-1000 rows), do it one-by-one
  // rather than batch UPDATE … FROM (D1's not great at that).
  const session = c.get("session");
  for (let i = 0; i < list.length; i++) {
    const rank = i + 1;
    const rowTier = rank <= tierTop ? tier : null;
    await c.env.DB.prepare(
      "UPDATE scores SET rank = ?, tier = ? WHERE id = ?"
    ).bind(rank, rowTier, list[i].id).run();
  }

  await recordAudit(c.env, session.account_id, "scores.finalize", {
    type: "scores", id: event_key,
    payload: { section, count: list.length, tier_top: tierTop, tier },
  });

  return c.json({ ok: true, ranked: list.length, tier_top: tierTop });
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

  await recordAudit(c.env, session.account_id, "program.update", {
    type: "program", id: slug,
    payload: Object.fromEntries(
      keys.filter((k) => k !== "body_md" && k !== "pricing_json").map((k) => [k, sani.values[k]])
    ),
  });

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
    "price_label", "eyebrow", "image", "audience", "duration", "format", "outcome", "level",
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
  for (const k of ["hidden", "repeatable", "published"]) {
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

export default admin;
