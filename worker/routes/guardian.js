// Guardian-tier endpoints - mounted under /api/me/*. Any authenticated role
// (guardian, admin, editor, mentor) can hit these; admins use them for their
// own personal account, separate from the /api/admin/* namespace.

import { Hono } from "hono";
import { sessionMiddleware } from "../middleware/session.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { hashPassword, PBKDF2_ITERATIONS_CURRENT } from "../lib/crypto.js";
import { recordAudit } from "../lib/audit-log.js";
import { getBaseUrl, createId } from "../lib/util.js";
import { createVerificationToken, sendVerificationEmail, sendUpdatedReceiptForRegistration } from "../lib/email.js";
import { canonicalDistrict } from "../lib/districts.js";
import { normalizeBdPhone, isBdMobile } from "../lib/validation.js";
import { getCatalog } from "../lib/programs.js";
import { receiptSyncStatements } from "../lib/receipt.js";
import {
  getShurjopayConfig,
  shurjopayGetToken,
  shurjopayCreatePayment,
} from "../lib/shurjopay.js";

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
    const raw = body.phone.trim();
    // Canonicalise to +8801XXXXXXXXX and reject anything that isn't a valid BD
    // mobile - keeps self-service fixes consistent with registration and lets a
    // guardian actually clear the enrollment gate (see missingEnrollmentFields).
    const phone = raw ? normalizeBdPhone(raw) : "";
    if (phone && !isBdMobile(phone)) {
      return c.json({ error: "Enter a valid Bangladesh mobile number, e.g. 01712345678." }, 400);
    }
    sets.push("phone = ?");
    binds.push(phone || null);
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
      body.current_password, account.password_salt, account.password_iterations || 100000,
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

// Universal student-detail fields - accepted by BOTH the bulk PATCH
// /api/me/registrations (Profile page) AND the per-row PATCH
// /api/me/registrations/:id. Always editable regardless of payment
// status or any program's registrationEnds window; guardians fix
// typos in name/school/district without going through support.
const BULK_EDITABLE_REG_FIELDS = [
  "student_full_name", "student_date_of_birth", "student_class_name",
  "student_gender", "student_medium", "student_school", "student_district",
];

// Per-program meta - accepted ONLY by the per-row PATCH (the dashboard
// Edit-enrollment modal). preferred_subject is the Olympiad tiebreaker
// hint; preferred_venue is the exam-day region for Olympiad + Quiz.
// Both are gated by withinEditWindow() on the per-row handler.
const ROW_ONLY_REG_FIELDS = ["preferred_venue", "preferred_subject"];

const VALID_PREFERRED_SUBJECTS = ["math", "science", "both"];

// Builds the SET clause + bind values from a body. `allowed` lists the
// field names the caller permits; anything else in the body is ignored.
// Returns { error } on a bad district / subject, else { sets, binds }.
function buildRegUpdate(body, allowed) {
  const sets  = [];
  const binds = [];
  for (const f of allowed) {
    if (!(f in body)) continue;
    let v = typeof body[f] === "string" ? body[f].trim() : body[f];
    // District must match one of the 64 Bangladesh districts - same
    // rule as registration; canonicalDistrict normalises the casing.
    if (f === "student_district") {
      const canon = canonicalDistrict(v);
      if (!canon) return { error: "District must be one of the 64 Bangladesh districts." };
      v = canon;
    }
    // preferred_subject is the NQR tiebreaker hint (math / science /
    // both). Empty string clears it; anything else must match the
    // closed set we accept at registration.
    if (f === "preferred_subject") {
      if (v) {
        const lower = String(v).toLowerCase();
        if (!VALID_PREFERRED_SUBJECTS.includes(lower)) {
          return { error: "Preferred subject must be Math, Science, or Both." };
        }
        v = lower;
      }
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

  // Bulk path - universal student-detail fields only. preferred_subject
  // and preferred_venue are per-program meta; they go through the
  // per-row PATCH below so the registrationEnds window can be enforced.
  const { sets, binds, error } = buildRegUpdate(body, BULK_EDITABLE_REG_FIELDS);
  if (error) return c.json({ error }, 400);
  if (!sets.length) return c.json({ error: "Nothing to update." }, 400);

  const result = await c.env.DB.prepare(
    `UPDATE registrations SET ${sets.join(", ")} WHERE guardian_account_id = ?`
  ).bind(...binds, session.account_id).run();

  return c.json({ ok: true, updated: result.meta?.changes ?? 0 });
});

// PATCH /api/me/registrations/:id  { student_*, preferred_venue, preferred_subject }
// Single-row edit, scoped to a registration the caller owns. The bulk
// PATCH above is what the dashboard uses for student-detail edits; this
// is what the dashboard's unified edit modal posts to when the
// guardian touches preferred_subject (Olympiad tiebreaker) or
// preferred_venue (Olympiad + Quiz exam region). Per-program meta
// edits are gated by the program's registrationEnds window so a
// guardian can't change exam-day fields after registration has closed.
guardian.patch("/registrations/:id", async (c) => {
  const session = c.get("session");
  const id   = c.req.param("id");
  const body = await c.req.json();

  const reg = await c.env.DB.prepare(
    "SELECT id, registration_type, status FROM registrations WHERE id = ? AND guardian_account_id = ? LIMIT 1"
  ).bind(id, session.account_id).first();
  if (!reg) return c.json({ error: "Registration not found." }, 404);

  // Gate per-enrollment meta (subject/venue) by the program's edit
  // window. Student-detail fields (name, school, etc.) are universal
  // and stay editable any time - they're handled by the bulk PATCH
  // above too.
  const touchingMeta = "preferred_subject" in body || "preferred_venue" in body;
  const catalog = await getCatalog(c);
  if (touchingMeta && !catalog.withinEditWindow(reg.registration_type)) {
    return c.json({
      error: "The edit window for this program has closed. Email support@bdmso.org if you need help.",
    }, 409);
  }

  // Per-row path accepts both the universal student fields AND the
  // per-program meta (subject / venue). Window check above already
  // gates the meta fields.
  const allowed = [...BULK_EDITABLE_REG_FIELDS, ...ROW_ONLY_REG_FIELDS];
  const { sets, binds, error } = buildRegUpdate(body, allowed);
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
      error: "This registration is already paid. Email support@bdmso.org if you need help.",
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

// ── Option changes ───────────────────────────────────────────────────
// Guardian-initiated edits to the per-registration selection (Prep Course
// subjects, Mock Test sessions). The SPA computes the diff client-side
// from the inline options_config that /api/me serves, so there is no
// preview endpoint - either PATCH /options or POST /options/upgrade is
// called directly when the guardian confirms.

// Option ids already held by sibling registrations of the same program
// on this account (excluding cancelled rows and the row being edited).
// Used to refuse a change that would re-pick a session the guardian
// already owns elsewhere.
async function getSiblingTakenIds(env, accountId, registrationType, exceptId) {
  const rows = await env.DB.prepare(
    `SELECT id, program_options FROM registrations
       WHERE guardian_account_id = ? AND registration_type = ? AND status != 'cancelled'`
  ).bind(accountId, registrationType).all();
  const taken = new Set();
  for (const r of (rows?.results || [])) {
    if (r.id === exceptId) continue;
    try {
      const v = JSON.parse(r.program_options || "[]");
      if (Array.isArray(v)) for (const id of v) if (typeof id === "string") taken.add(id);
    } catch {}
  }
  return taken;
}

async function loadOptionContext(c, registrationId) {
  const session = c.get("session");
  const reg = await c.env.DB.prepare(
    "SELECT id, registration_type, status, program_options FROM registrations WHERE id = ? AND guardian_account_id = ? LIMIT 1"
  ).bind(registrationId, session.account_id).first();
  if (!reg) return { error: c.json({ error: "Registration not found." }, 404) };
  if (reg.status === "cancelled") {
    return { error: c.json({ error: "This registration was cancelled." }, 409) };
  }
  const catalog = await getCatalog(c);
  if (!catalog.hasEditableSelection(reg.registration_type)) {
    return { error: c.json({ error: "This program has no editable selection." }, 400) };
  }
  if (!catalog.withinEditWindow(reg.registration_type)) {
    return { error: c.json({
      error: "The selection edit window for this program has closed. Email support@bdmso.org if you need help.",
    }, 409) };
  }
  let currentIds = [];
  try { currentIds = JSON.parse(reg.program_options || "[]"); } catch {}
  return { session, reg, currentIds, catalog };
}

// PATCH /api/me/registrations/:id/options  { options, acknowledge_no_refund? }
// Handles: any change on an unpaid registration; same-price swaps on paid
// registrations; and paid-registration downgrades (which require the ack
// flag to confirm no refund). Upgrades on paid rows are rejected with a
// hint to use POST /options/upgrade instead.
guardian.patch("/registrations/:id/options", async (c) => {
  const ctx = await loadOptionContext(c, c.req.param("id"));
  if (ctx.error) return ctx.error;
  const body = await c.req.json().catch(() => ({}));
  const diff = ctx.catalog.diffSelection(ctx.reg.registration_type, ctx.currentIds, body.options);
  if (!diff.ok) return c.json({ error: diff.error }, 400);

  // Duplicate guard: refuse if any newly-picked id is already on a
  // sibling (non-cancelled) registration of the same program. Cancelled
  // siblings are intentionally excluded - they no longer hold the slot.
  const taken = await getSiblingTakenIds(c.env, ctx.session.account_id, ctx.reg.registration_type, ctx.reg.id);
  const overlap = diff.normalizedTo.filter((id) => taken.has(id));
  if (overlap.length) {
    const labels = ctx.catalog.selectionLabels(ctx.reg.registration_type, overlap).join(", ");
    return c.json({
      error: `Already enrolled in: ${labels}. Pick a different selection or cancel the other registration first.`,
      conflict: overlap,
    }, 409);
  }

  // Concurrency guard: refuse if a pending payment is mid-flight, otherwise
  // the change could race with a payment-callback flipping options or status.
  const pending = await c.env.DB.prepare(
    "SELECT id FROM payments WHERE registration_id = ? AND status = 'pending' LIMIT 1"
  ).bind(ctx.reg.id).first();
  if (pending) {
    return c.json({
      error: "A payment is in progress for this registration. Finish or cancel it before changing your selection.",
    }, 409);
  }

  const paid = ctx.reg.status === "paid";
  if (paid && diff.action === "upgrade") {
    return c.json({
      error: "Upgrading to a more expensive selection requires a top-up payment. Use the upgrade endpoint.",
      action: "upgrade",
      delta: diff.delta,
    }, 402);
  }
  const acked = !!body.acknowledge_no_refund;
  if (paid && diff.action === "downgrade" && !acked) {
    return c.json({
      error: `Switching to a cheaper selection won't be refunded. Confirm with acknowledge_no_refund:true to proceed.`,
      action: "downgrade",
      delta: diff.delta,
    }, 409);
  }

  const now = new Date().toISOString();
  const toJson = JSON.stringify(diff.normalizedTo);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE registrations SET program_options = ? WHERE id = ?")
      .bind(toJson, ctx.reg.id),
    c.env.DB.prepare(`
      INSERT INTO registration_option_changes
        (registration_id, from_options, to_options, from_price, to_price, delta,
         action, payment_id, actor_account_id, acknowledged_no_refund, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
    `).bind(
      ctx.reg.id,
      JSON.stringify(ctx.currentIds),
      toJson,
      diff.fromPrice,
      diff.toPrice,
      diff.delta,
      diff.action,
      ctx.session.account_id,
      paid && diff.action === "downgrade" ? 1 : 0,
      now,
    ),
    // Keep the receipt in step with the new selection (run-priced only).
    ...receiptSyncStatements(c.env, ctx.catalog, ctx.reg.id, ctx.reg.registration_type, diff.normalizedTo, now),
  ]);

  // Receipts only exist for paid registrations - skip the email on an
  // unpaid edit (the guardian will see their new total at checkout).
  // Also throttle: if the guardian already triggered a change-receipt
  // for this registration in the last 60 seconds, skip this one to
  // prevent a runaway PATCH loop from blasting their inbox. The DB
  // and dashboard always reflect the latest state; the email is the
  // only thing being throttled, not the change itself.
  if (paid) {
    const cutoff = new Date(Date.now() - 60_000).toISOString();
    const recent = await c.env.DB.prepare(
      "SELECT id FROM registration_option_changes WHERE registration_id = ? AND created_at > ? AND created_at < ? LIMIT 1"
    ).bind(ctx.reg.id, cutoff, now).first();
    if (!recent) {
      try { await sendUpdatedReceiptForRegistration(c.env, ctx.reg.id, getBaseUrl(c.req.raw)); }
      catch (err) { console.log("[options/patch] receipt error:", err.message); }
    } else {
      console.log(`[options/patch] receipt email skipped (throttled) for reg ${ctx.reg.id}`);
    }
  }

  return c.json({
    ok: true,
    action: diff.action,
    delta: diff.delta,
    options: diff.normalizedTo,
  });
});

// POST /api/me/registrations/:id/options/upgrade  { options }
// Paid + upgrade only. Creates a pending payment row for the price delta
// and returns the shurjoPay checkout URL. The actual program_options
// update happens in the payment-callback success branch once the gateway
// confirms the top-up. The proposed options are stored on the payment
// row so the callback knows what to commit.
guardian.post("/registrations/:id/options/upgrade", async (c) => {
  const ctx = await loadOptionContext(c, c.req.param("id"));
  if (ctx.error) return ctx.error;
  if (ctx.reg.status !== "paid") {
    return c.json({ error: "This registration isn't paid yet - update options directly via PATCH." }, 409);
  }
  const body = await c.req.json().catch(() => ({}));
  const diff = ctx.catalog.diffSelection(ctx.reg.registration_type, ctx.currentIds, body.options);
  if (!diff.ok) return c.json({ error: diff.error }, 400);
  if (diff.action !== "upgrade") {
    return c.json({ error: "This endpoint is for upgrades only.", action: diff.action }, 400);
  }

  // Same duplicate guard as the PATCH path. Cancelled siblings excluded.
  const taken = await getSiblingTakenIds(c.env, ctx.session.account_id, ctx.reg.registration_type, ctx.reg.id);
  const overlap = diff.normalizedTo.filter((id) => taken.has(id));
  if (overlap.length) {
    const labels = ctx.catalog.selectionLabels(ctx.reg.registration_type, overlap).join(", ");
    return c.json({
      error: `Already enrolled in: ${labels}. Pick a different selection or cancel the other registration first.`,
      conflict: overlap,
    }, 409);
  }

  const pending = await c.env.DB.prepare(
    "SELECT id FROM payments WHERE registration_id = ? AND status = 'pending' LIMIT 1"
  ).bind(ctx.reg.id).first();
  if (pending) {
    return c.json({
      error: "A payment is already in progress for this registration. Finish or cancel it before starting another.",
    }, 409);
  }

  // shurjoPay needs the guardian contact again - pulled fresh from the
  // registration row rather than trusted from the client.
  const regDetail = await c.env.DB.prepare(
    "SELECT guardian_full_name, guardian_phone, guardian_email, guardian_address, student_district FROM registrations WHERE id = ? LIMIT 1"
  ).bind(ctx.reg.id).first();

  const tranId = createId("txn");
  const now    = new Date().toISOString();
  const base   = getBaseUrl(c.req.raw);
  const amount = diff.delta;

  const clientIp = c.req.header("cf-connecting-ip")
                || c.req.header("x-forwarded-for")?.split(",")[0].trim()
                || "0.0.0.0";

  const config = getShurjopayConfig(c.env);
  let spRes;
  try {
    const tokenInfo = await shurjopayGetToken(config, c.env);
    spRes = await shurjopayCreatePayment(config, tokenInfo, {
      order_id:           tranId,
      // Live shurjoPay zeroes a stringified amount; send the raw
      // number. See worker/routes/public.js for the same fix on the
      // initial-payment path.
      amount:             amount,
      client_ip:          clientIp,
      return_url:         `${base}/api/payment-callback`,
      cancel_url:         `${base}/api/payment-callback`,
      customer_name:      regDetail.guardian_full_name,
      customer_phone:     regDetail.guardian_phone,
      customer_email:     regDetail.guardian_email,
      customer_address:   regDetail.guardian_address || regDetail.student_district,
      customer_city:      regDetail.student_district,
      customer_post_code: "1000",
    });
  } catch (err) {
    console.error("[guardian.pay] gateway error:", err?.stack || err?.message || err);
    return c.json({ error: "Payment gateway error. Please try again." }, 502);
  }

  const paymentId = createId("pay");
  try {
    await c.env.DB.prepare(
      `INSERT INTO payments (
         id, registration_id, amount, currency, tran_id, val_id,
         status, purpose, proposed_options, cohort_key, created_at, updated_at
       ) VALUES (?, ?, ?, 'BDT', ?, ?, 'pending', 'option-upgrade', ?, (SELECT cohort_key FROM registrations WHERE id = ?), ?, ?)`
    ).bind(
      paymentId,
      ctx.reg.id,
      amount,
      tranId,
      spRes.sp_order_id || null,
      JSON.stringify(diff.normalizedTo),
      ctx.reg.id,
      now,
      now,
    ).run();
  } catch (err) {
    // Two parallel requests can both pass the pending-check above; the
    // partial unique index on payments (idx_payments_one_pending_upgrade)
    // makes one of them lose at INSERT time. Surface a 409 so the second
    // tab matches the first tab's "payment already in progress" message.
    if (String(err.message || "").toLowerCase().includes("unique")) {
      return c.json({
        error: "A payment is already in progress for this registration. Finish or cancel it before starting another.",
      }, 409);
    }
    throw err;
  }

  return c.json({ ok: true, checkoutURL: spRes.checkout_url, delta: amount });
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
    current_password, account.password_salt, account.password_iterations || 100000,
  );
  if (currentHash !== account.password_hash) {
    return c.json({ error: "Current password is incorrect." }, 401);
  }

  const newSalt = crypto.randomUUID();
  const newHash = await hashPassword(new_password, newSalt, PBKDF2_ITERATIONS_CURRENT);
  // Update password AND drop every other session in one batch. A
  // password change that leaves other devices logged in defeats the
  // point of changing it (e.g. compromised laptop, shared computer).
  // The /revoke-sessions endpoint stays available for explicit
  // "log me out everywhere" actions; this just makes it implicit on
  // every password change.
  const revoke = await c.env.DB.batch([
    c.env.DB.prepare(`
      UPDATE guardian_accounts
         SET password_hash = ?, password_salt = ?, password_iterations = ?
       WHERE id = ?
    `).bind(newHash, newSalt, PBKDF2_ITERATIONS_CURRENT, session.account_id),
    c.env.DB.prepare(
      "DELETE FROM sessions WHERE account_id = ? AND id != ?"
    ).bind(session.account_id, session.id),
  ]);
  const revokedCount = revoke[1]?.meta?.changes ?? 0;

  // Audited because admins changing their password matters for incident review.
  if (session.role === "admin") {
    await recordAudit(c.env, session.account_id, "account.change_password", {
      type: "user", id: session.account_id, payload: { self: true, revoked_sessions: revokedCount },
    });
  }

  return c.json({ ok: true, revokedSessions: revokedCount });
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
