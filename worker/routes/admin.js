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

// Smoke-test endpoint. Useful for the upcoming admin SPA to verify the user is
// authenticated as an admin before mounting protected routes. Returns the
// session info so the SPA doesn't need a separate identity call.
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

export default admin;
