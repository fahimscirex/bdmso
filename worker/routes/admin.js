// Admin-tier endpoints — mounted under /api/admin/*. Role-gated to admin
// only at the namespace level. Future sub-paths can widen access selectively:
//
//   admin.use("/posts/*", requireRole("admin", "editor"));
//
// Mutating handlers should call recordAudit(env, session.account_id, "...", {...})
// after a successful change so the action shows up in admin_audit_log.

import { Hono } from "hono";
import { sessionMiddleware } from "../middleware/session.js";
import { requireRole } from "../middleware/requireRole.js";
import { recordAudit } from "../lib/audit-log.js";

const admin = new Hono();

admin.use("*", sessionMiddleware);
admin.use("*", requireRole("admin"));

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
//     status   — registration status filter ('submitted'|'paid'|'cancelled')
//     type     — registration_type slug filter
//     limit    — max rows (default 200, hard cap 1000)
//
// Sort: newest first.
admin.get("/registrations", async (c) => {
  const status = c.req.query("status");
  const type   = c.req.query("type");
  const limit  = Math.min(Number(c.req.query("limit")) || 200, 1000);

  const wheres = [];
  const binds  = [];
  if (status) { wheres.push("r.status = ?");            binds.push(status); }
  if (type)   { wheres.push("r.registration_type = ?"); binds.push(type); }
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

  // Summary counts — useful for the list header. Single round-trip via a
  // separate batched query so the main rows don't carry repeated totals.
  const summary = await c.env.DB.prepare(`
    SELECT
      COUNT(*)                                                   AS total,
      SUM(CASE WHEN status = 'paid'      THEN 1 ELSE 0 END)      AS paid,
      SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END)      AS pending,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)      AS cancelled
    FROM registrations
  `).first();

  return c.json({
    ok: true,
    rows: rows.results,
    summary: {
      total:     Number(summary?.total)     || 0,
      paid:      Number(summary?.paid)      || 0,
      pending:   Number(summary?.pending)   || 0,
      cancelled: Number(summary?.cancelled) || 0,
    },
    filter: { status: status || null, type: type || null, limit },
  });
});

// GET /api/admin/registrations/:id
// Full registration + all payments + guardian profile.
admin.get("/registrations/:id", async (c) => {
  const id = c.req.param("id");

  const reg = await c.env.DB.prepare(`
    SELECT r.*, a.email_verified AS guardian_email_verified, a.member_id AS guardian_member_id
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

export default admin;
