// Guardian-tier endpoints - mounted under /api/me/*. Any authenticated role
// (guardian, admin, editor, mentor) can hit these; admins use them for their
// own personal account, separate from the /api/admin/* namespace.

import { Hono } from "hono";
import { sessionMiddleware } from "../middleware/session.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { hashPassword, PBKDF2_ITERATIONS_CURRENT } from "../lib/crypto.js";
import { recordAudit } from "../lib/audit-log.js";
import { getBaseUrl } from "../lib/util.js";
import { createVerificationToken, sendVerificationEmail } from "../lib/email.js";
import { canonicalDistrict } from "../lib/districts.js";

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

// PATCH /api/me/profile  { fullName, email, phone }
// Guardians self-edit their own account contact details. Changing the
// email resets verification and sends a fresh verification link to the
// new address (the old one stays usable for login until verified).
guardian.patch("/profile", async (c) => {
  const session = c.get("session");
  const body = await c.req.json();

  const sets = [];
  const binds = [];
  let emailChanged = false;
  let newEmail = null;

  if (typeof body.fullName === "string") {
    const name = body.fullName.trim();
    if (!name) return c.json({ error: "Name can't be empty." }, 400);
    sets.push("full_name = ?");
    binds.push(name);
  }

  if (typeof body.phone === "string") {
    sets.push("phone = ?");
    binds.push(body.phone.trim() || null);
  }

  if (typeof body.email === "string") {
    newEmail = body.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return c.json({ error: "Enter a valid email address." }, 400);
    }
    if (newEmail !== (session.email || "").toLowerCase()) {
      const clash = await c.env.DB.prepare(
        "SELECT id FROM guardian_accounts WHERE email = ? AND id != ? LIMIT 1"
      ).bind(newEmail, session.account_id).first();
      if (clash) return c.json({ error: "That email is already in use by another account." }, 409);
      emailChanged = true;
      sets.push("email = ?");
      binds.push(newEmail);
      sets.push("email_verified = 0");
    }
  }

  if (!sets.length) return c.json({ error: "Nothing to update." }, 400);

  // Changing the email - a primary login identifier - requires the
  // current password. Blocks account takeover from a hijacked session
  // token or an unattended open browser. Name/phone edits don't.
  if (emailChanged) {
    if (typeof body.current_password !== "string" || !body.current_password) {
      return c.json({ error: "Enter your current password to change your email." }, 400);
    }
    const account = await c.env.DB.prepare(
      "SELECT password_hash, password_salt, password_iterations FROM guardian_accounts WHERE id = ? LIMIT 1"
    ).bind(session.account_id).first();
    if (!account) return c.json({ error: "Account not found." }, 404);
    const attemptHash = await hashPassword(
      body.current_password, account.password_salt, account.password_iterations || 120000,
    );
    if (attemptHash !== account.password_hash) {
      return c.json({ error: "Current password is incorrect." }, 401);
    }
  }

  await c.env.DB.prepare(
    `UPDATE guardian_accounts SET ${sets.join(", ")} WHERE id = ?`
  ).bind(...binds, session.account_id).run();

  // New email is unverified - drop stale tokens and send a fresh link.
  if (emailChanged) {
    await c.env.DB.prepare("DELETE FROM email_verification_tokens WHERE account_id = ?")
      .bind(session.account_id).run();
    const token = await createVerificationToken(c.env, session.account_id);
    const verifyUrl = `${getBaseUrl(c.req.raw)}/api/verify-email?token=${token}`;
    await sendVerificationEmail(c.env, newEmail, verifyUrl);
  }

  return c.json({ ok: true, emailChanged });
});

// Student-detail fields a guardian may self-edit on their registrations.
// Allowed regardless of payment status - guardians fix typos in
// school/district/gender without going through support. BdMSO ID +
// receipt stay attached to the row, so the audit trail is preserved.
const EDITABLE_REG_FIELDS = [
  "student_full_name", "student_date_of_birth", "student_class_name",
  "student_gender", "student_medium", "student_school", "student_district",
  "preferred_venue",
];

// Builds the SET clause + bind values for an EDITABLE_REG_FIELDS patch.
// Returns { error } on a bad district, else { sets, binds }.
function buildRegUpdate(body) {
  const sets  = [];
  const binds = [];
  for (const f of EDITABLE_REG_FIELDS) {
    if (!(f in body)) continue;
    let v = typeof body[f] === "string" ? body[f].trim() : body[f];
    // District must match one of the 64 Bangladesh districts - same
    // rule as registration; canonicalDistrict normalises the casing.
    if (f === "student_district") {
      const canon = canonicalDistrict(v);
      if (!canon) return { error: "District must be one of the 64 Bangladesh districts." };
      v = canon;
    }
    sets.push(`${f} = ?`);
    binds.push(v || null);
  }
  return { sets, binds };
}

// PATCH /api/me/registrations  { student_*, preferred_venue }
// Bulk-edit the student across EVERY one of this account's registration
// rows. Student details are denormalised per registration, so a single
// UPDATE keeps all rows consistent - there is no partial-failure window
// the way a client-side loop of per-row PATCH requests had.
guardian.patch("/registrations", async (c) => {
  const session = c.get("session");
  const body = await c.req.json();

  const { sets, binds, error } = buildRegUpdate(body);
  if (error) return c.json({ error }, 400);
  if (!sets.length) return c.json({ error: "Nothing to update." }, 400);

  const result = await c.env.DB.prepare(
    `UPDATE registrations SET ${sets.join(", ")} WHERE guardian_account_id = ?`
  ).bind(...binds, session.account_id).run();

  return c.json({ ok: true, updated: result.meta?.changes ?? 0 });
});

// PATCH /api/me/registrations/:id  { student_*, preferred_venue }
// Single-row edit, scoped to a registration the caller owns. The bulk
// PATCH above is what the dashboard uses for student-detail edits; this
// stays for targeted one-row corrections.
guardian.patch("/registrations/:id", async (c) => {
  const session = c.get("session");
  const id   = c.req.param("id");
  const body = await c.req.json();

  const reg = await c.env.DB.prepare(
    "SELECT id, status FROM registrations WHERE id = ? AND guardian_account_id = ? LIMIT 1"
  ).bind(id, session.account_id).first();
  if (!reg) return c.json({ error: "Registration not found." }, 404);

  const { sets, binds, error } = buildRegUpdate(body);
  if (error) return c.json({ error }, 400);
  if (!sets.length) return c.json({ error: "Nothing to update." }, 400);

  await c.env.DB.prepare(
    `UPDATE registrations SET ${sets.join(", ")} WHERE id = ?`
  ).bind(...binds, id).run();

  return c.json({ ok: true, id });
});

// POST /api/me/registrations/:id/cancel
// Guardian-initiated soft cancel. Only allowed on still-submitted (not
// yet paid) rows - paid rows go through support so refunds + receipts
// stay aligned. The row stays in the table so we keep an audit trail;
// status flips to 'cancelled' and the dashboard filters / muted styles
// take over from there.
guardian.post("/registrations/:id/cancel", async (c) => {
  const session = c.get("session");
  const id = c.req.param("id");

  const reg = await c.env.DB.prepare(
    "SELECT id, status FROM registrations WHERE id = ? AND guardian_account_id = ? LIMIT 1"
  ).bind(id, session.account_id).first();
  if (!reg) return c.json({ error: "Registration not found." }, 404);
  if (reg.status === "cancelled") return c.json({ ok: true, id });
  if (reg.status === "paid") {
    return c.json({
      error: "This registration is already paid. Email hello@bdmso.org for a refund.",
    }, 409);
  }

  // Cancel the row and void any in-flight payment in the same batch. A
  // guardian who already started checkout in another tab could otherwise
  // complete it - the payment callback only matches status = 'pending'
  // and would flip this registration back to 'paid'.
  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE registrations SET status = 'cancelled' WHERE id = ?").bind(id),
    c.env.DB.prepare(
      "UPDATE payments SET status = 'cancelled', updated_at = ? WHERE registration_id = ? AND status = 'pending'"
    ).bind(now, id),
  ]);

  return c.json({ ok: true, id });
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
