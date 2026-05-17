// Guardian-tier endpoints — mounted under /api/me/*. Any authenticated role
// (guardian, admin, editor, mentor) can hit these; admins use them for their
// own personal account, separate from the /api/admin/* namespace.

import { Hono } from "hono";
import { sessionMiddleware } from "../middleware/session.js";
import { requireAuth } from "../middleware/requireAuth.js";

const guardian = new Hono();

guardian.use("*", sessionMiddleware);
guardian.use("*", requireAuth);

// Profile self-read. Used by both /dashboard and /admin to populate the
// header (name, role badge) without an extra round-trip to /api/me.
guardian.get("/profile", async (c) => {
  const session = c.get("session");
  const row = await c.env.DB.prepare(
    "SELECT email_verified, member_id, phone FROM guardian_accounts WHERE id = ? LIMIT 1"
  ).bind(session.account_id).first();

  return c.json({
    accountId: session.account_id,
    fullName: session.full_name,
    email: session.email,
    phone: row?.phone || null,
    role: session.role || "guardian",
    emailVerified: !!row?.email_verified,
    memberId: row?.member_id || null,
  });
});

export default guardian;
