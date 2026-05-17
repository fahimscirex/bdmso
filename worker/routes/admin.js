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

export default admin;
