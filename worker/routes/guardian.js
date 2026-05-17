// Guardian-tier endpoints — mounted under /api/me/*. Any authenticated role
// (guardian, admin, editor, mentor) can hit these; admins use them for their
// own personal account, separate from the /api/admin/* namespace.

import { Hono } from "hono";
import { sessionMiddleware } from "../middleware/session.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { hashPassword, PBKDF2_ITERATIONS_CURRENT } from "../lib/crypto.js";
import { recordAudit } from "../lib/audit-log.js";

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

// POST /api/me/change-password  { current_password, new_password }
// Verifies current password, rehashes new one at the current iteration
// count, leaves other sessions intact (caller can hit /revoke-sessions
// next if they want to sign out everywhere).
guardian.post("/change-password", async (c) => {
  const session = c.get("session");
  const { current_password, new_password } = await c.req.json();
  if (!current_password || !new_password) {
    return c.json({ error: "Current and new password are required." }, 400);
  }
  if (new_password.length < 8) {
    return c.json({ error: "New password must be at least 8 characters." }, 400);
  }
  if (current_password === new_password) {
    return c.json({ error: "New password must differ from the current one." }, 400);
  }

  const account = await c.env.DB.prepare(
    "SELECT password_hash, password_salt, password_iterations FROM guardian_accounts WHERE id = ? LIMIT 1"
  ).bind(session.account_id).first();
  if (!account) return c.json({ error: "Account not found." }, 404);

  const currentHash = await hashPassword(
    current_password, account.password_salt, account.password_iterations || 120000,
  );
  if (currentHash !== account.password_hash) {
    return c.json({ error: "Current password is incorrect." }, 401);
  }

  const newSalt = crypto.randomUUID();
  const newHash = await hashPassword(new_password, newSalt, PBKDF2_ITERATIONS_CURRENT);
  await c.env.DB.prepare(`
    UPDATE guardian_accounts
       SET password_hash = ?, password_salt = ?, password_iterations = ?
     WHERE id = ?
  `).bind(newHash, newSalt, PBKDF2_ITERATIONS_CURRENT, session.account_id).run();

  // Audited because admins changing their password matters for incident review.
  if (session.role === "admin") {
    await recordAudit(c.env, session.account_id, "account.change_password", {
      type: "user", id: session.account_id, payload: { self: true },
    });
  }

  return c.json({ ok: true });
});

// POST /api/me/revoke-sessions
// Deletes every session row for this account EXCEPT the one currently
// authenticated. Useful after a password change, or if the user thinks
// a device might be compromised.
guardian.post("/revoke-sessions", async (c) => {
  const session = c.get("session");
  const result = await c.env.DB.prepare(
    "DELETE FROM sessions WHERE account_id = ? AND id != ?"
  ).bind(session.account_id, session.id).run();

  return c.json({
    ok: true,
    revoked: result.meta?.changes ?? 0,
  });
});

export default guardian;
