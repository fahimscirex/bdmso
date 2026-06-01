// Public-tier API handlers - no auth or auth required only via Bearer token.
// All handlers preserve the exact behavior from the pre-Hono single-file
// worker. They take (request, env [, url]) and return a Response.

import { jsonResponse, badRequest, redirectTo, createId, couponAppliesToType, parseJson, getBaseUrl } from "../lib/util.js";
import { normalizeString, requireField, isEmail, isPhoneLike } from "../lib/validation.js";
import { hashPassword, PBKDF2_ITERATIONS_CURRENT, DUMMY_HASH_SALT } from "../lib/crypto.js";
import { createSession, extractToken, requireAuth } from "../lib/sessions.js";
import { checkLoginRateLimit, recordLoginAttempt, checkActionRateLimit, recordActionAttempt, clientIpFor } from "../lib/rate-limit.js";
import { createVerificationToken, sendVerificationEmail, sendSponsorshipNotification, assignMemberIdAndSendReceipt, createPasswordResetToken, sendPasswordResetEmail, sendUpdatedReceiptForRegistration } from "../lib/email.js";
import { recordAudit } from "../lib/audit-log.js";
import { loadCatalog } from "../lib/programs.js";
// Program catalog now comes from D1 via loadCatalog(env). registrationOpenFor,
// effectiveProgramPrice, names/prices and the option logic are catalog methods
// (see lib/programs.js) - each handler does `const catalog = await loadCatalog(env)`
// once. Keeping the call sites on the catalog API insulates them from future
// schema/vocabulary changes.
import { getShurjopayConfig, shurjopayGetToken, shurjopayCreatePayment, shurjopayVerify } from "../lib/shurjopay.js";
import { canonicalDistrict } from "../lib/districts.js";

// Returns option ids already held by any non-cancelled registration of
// the given program on the given account, EXCLUDING the optional
// exceptRegistrationId (so a change-selection edit can keep its own
// row's ids without seeing itself as a conflict). Caller compares this
// set against the proposed ids to decide if a duplicate is being
// attempted - same Mock Test session booked twice, same Prep subject
// picked on a second Prep registration, etc.
async function getTakenOptionIds(env, accountId, registrationType, exceptRegistrationId = null) {
  const rows = await env.DB.prepare(
    `SELECT id, program_options FROM registrations
       WHERE guardian_account_id = ? AND registration_type = ? AND status != 'cancelled'`
  ).bind(accountId, registrationType).all();
  const taken = new Set();
  for (const r of (rows?.results || [])) {
    if (exceptRegistrationId && r.id === exceptRegistrationId) continue;
    try {
      const v = JSON.parse(r.program_options || "[]");
      if (Array.isArray(v)) for (const id of v) if (typeof id === "string") taken.add(id);
    } catch { /* skip malformed rows */ }
  }
  return taken;
}


export async function handleLogin(request, env) {
  const payload = await parseJson(request);
  const email    = requireField(payload.email,    "Email").toLowerCase();
  const password = requireField(payload.password, "Password");

  if (!(await checkLoginRateLimit(env, email))) {
    return badRequest("Too many failed attempts. Please try again in 15 minutes.", 429);
  }

  const account = await env.DB.prepare(
    "SELECT id, email, full_name, password_hash, password_salt, password_iterations, email_verified, role FROM guardian_accounts WHERE email = ? LIMIT 1"
  ).bind(email).first();

  if (!account) {
    // Burn equivalent CPU to a real verify so response time can't distinguish
    // "email not registered" from "wrong password". See PBKDF2_ITERATIONS_CURRENT.
    await hashPassword(password, DUMMY_HASH_SALT, PBKDF2_ITERATIONS_CURRENT);
    await recordLoginAttempt(env, email, false);
    return badRequest("Invalid email or password.", 401);
  }

  const storedIterations = account.password_iterations || 100000;
  const hash = await hashPassword(password, account.password_salt, storedIterations);
  if (hash !== account.password_hash) {
    await recordLoginAttempt(env, email, false);
    return badRequest("Invalid email or password.", 401);
  }

  // Opportunistic hash upgrade: if this account was hashed with fewer iterations
  // than current recommendation, re-hash now that we have the plaintext password.
  if (storedIterations < PBKDF2_ITERATIONS_CURRENT) {
    const upgradedHash = await hashPassword(password, account.password_salt, PBKDF2_ITERATIONS_CURRENT);
    await env.DB.prepare(
      "UPDATE guardian_accounts SET password_hash = ?, password_iterations = ? WHERE id = ?"
    ).bind(upgradedHash, PBKDF2_ITERATIONS_CURRENT, account.id).run();
  }

  await recordLoginAttempt(env, email, true);
  const token = await createSession(env, account.id);
  // Audit admin authentication. Guardian logins are high-volume and
  // not interesting from an incident-review angle; admin logins are
  // the right place to spot credential compromise.
  if (account.role === "admin") {
    const ip = clientIpFor(request);
    try {
      await recordAudit(env, account.id, "auth.login", {
        type: "user", id: account.id, payload: { ip },
      });
    } catch (err) { console.log("[auth.login] audit failed:", err.message); }
  }
  return jsonResponse({
    ok: true, token,
    accountId: account.id,
    fullName: account.full_name,
    email: account.email,
    role: account.role || "guardian",
    emailVerified: !!account.email_verified
  });
}

export async function handleLogout(request, env) {
  const token = extractToken(request);
  if (token) {
    // Audit admin logout BEFORE the session row goes away so the actor
    // is still resolvable. Guardian logouts skipped for the same
    // volume/value reasoning as login.
    const session = await env.DB.prepare(
      "SELECT s.account_id, a.role FROM sessions s JOIN guardian_accounts a ON a.id = s.account_id WHERE s.id = ? LIMIT 1"
    ).bind(token).first();
    if (session?.role === "admin") {
      try {
        await recordAudit(env, session.account_id, "auth.logout", {
          type: "user", id: session.account_id, payload: { ip: clientIpFor(request) },
        });
      } catch (err) { console.log("[auth.logout] audit failed:", err.message); }
    }
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(token).run();
  }
  return jsonResponse({ ok: true });
}

export async function handleMe(request, env) {
  let account;
  try { account = await requireAuth(request, env); }
  catch (e) { return badRequest(e.message, e.status || 401); }

  const [acctRow, rows] = await Promise.all([
    env.DB.prepare(
      "SELECT email_verified, member_id FROM guardian_accounts WHERE id = ? LIMIT 1"
    ).bind(account.account_id).first(),
    env.DB.prepare(`
      SELECT r.id, r.registration_type, r.student_full_name,
             r.student_date_of_birth, r.student_medium, r.student_class_name,
             r.student_gender, r.student_school, r.student_district,
             r.preferred_venue, r.preferred_subject, r.program_options,
             r.status, r.member_id, r.created_at,
             p.id         AS payment_id,
             p.status     AS payment_status,
             p.amount     AS payment_amount,
             p.tran_id,
             p.method     AS payment_method,
             p.updated_at AS payment_date,
             -- Cumulative across every paid payment (initial + any
             -- option-upgrade top-ups). Used by the printable receipt
             -- to show "total paid", since payment_amount above is the
             -- initial-only value.
             (
               SELECT COALESCE(SUM(amount), 0)
               FROM payments
               WHERE registration_id = r.id AND status = 'paid'
             ) AS total_paid
      FROM registrations r
      -- payment_status / amount / tran_id reflect the registration's
      -- primary payment, NOT any top-up. Scope to purpose='initial' so
      -- an in-flight option-upgrade can't flip the dashboard to
      -- pending/failed and re-trigger the Pay Now flow on a paid row.
      LEFT JOIN payments p ON p.id = (
        SELECT id FROM payments
        WHERE registration_id = r.id AND purpose = 'initial'
        ORDER BY created_at DESC LIMIT 1
      )
      WHERE r.guardian_account_id = ?
      ORDER BY r.created_at DESC
    `).bind(account.account_id).all(),
  ]);

  // Enrich each registration with the program's display label + fee, from the
  // D1 catalog. The SPA never hard-codes program names or prices.
  const catalog = await loadCatalog(env);
  // option_labels resolves the chosen option ids (e.g. mock-test sessions,
  // prep-course subject) to human labels so cards/receipts can show which.
  const optionLabelsFor = (r) => {
    let ids = [];
    try { ids = JSON.parse(r.program_options || "[]"); } catch { return []; }
    return catalog.getOptionLabels(r.registration_type, Array.isArray(ids) ? ids : []);
  };
  const registrations = (rows.results || []).map((r) => {
    return {
      ...r,
      program_label: catalog.nameFor(r.registration_type),
      program_price: catalog.effectiveProgramPrice(r),
      option_labels: optionLabelsFor(r),
      // The SPA renders the unified edit modal entirely from these fields, so it
      // never fetches the catalog. options_config is the legacy client shape
      // (kind/items) and is null for option-less programs. edit_window_open
      // gates every guardian edit and is true while today <= registration_closes.
      options_config: catalog.clientOptions(r.registration_type),
      edit_window_open: catalog.withinEditWindow(r.registration_type),
      // Date fields the dashboard's "Key dates" card derives from (ISO; null if absent).
      registration_ends:       catalog.registrationClosesFor(r.registration_type),
      starts_on:               catalog.startsOnFor(r.registration_type),
    };
  });

  return jsonResponse({
    ok: true,
    account: {
      fullName: account.full_name,
      email: account.email,
      role: account.role || "guardian",
      emailVerified: !!acctRow?.email_verified,
      memberId: acctRow?.member_id || null
    },
    registrations
  });
}

// Public program catalogue, served from D1 (replaces the static
// public/data/programs-detail.json). Returns a bare array in the legacy field
// shape so consumers only swap their fetch URL. Rich per-program prose now
// lives in each program's markdown body (rendered by Astro), so it is not here.
export async function handleCatalog(request, env) {
  const { results } = await env.DB.prepare(`
    SELECT slug, title, category, eyebrow, image, audience, duration, format, outcome,
           level, price_label, fee_amount, pricing_json, schedule_label, starts_on, ends_on,
           registration_status, registration_opens, registration_closes, meta_description,
           home_order, register_url, register_label, hidden, repeatable
    FROM programs
    WHERE published = 1
    ORDER BY COALESCE(home_order, '99'), title
  `).all();

  const programs = (results || []).map((r) => {
    let options = null;
    try {
      const p = r.pricing_json ? JSON.parse(r.pricing_json) : null;
      if (p && Array.isArray(p.choices) && p.choices.length) {
        options = {
          kind: p.selection === "single" ? "radio" : "checkbox",
          items: p.choices.map((c) => ({ id: c.id, label: c.label, sub: c.note || "", price: c.price })),
        };
      }
    } catch { /* ignore bad json */ }
    return {
      slug: r.slug,
      title: r.title,
      category: r.category || null,
      eyebrow: r.eyebrow || null,
      image: r.image || null,
      audience: r.audience || null,
      duration: r.duration || null,
      format: r.format || null,
      outcome: r.outcome || null,
      level: r.level || null,
      price: r.price_label || null,
      feeAmount: r.fee_amount ?? null,
      schedule: r.schedule_label || null,
      startsOn: r.starts_on || null,
      endsOn: r.ends_on || null,
      registrationStatus: r.registration_status,
      registrationStarts: r.registration_opens || null,
      registrationEnds: r.registration_closes || null,
      // legacy boolean: open/coming-soon count as "registration enabled"
      registration: r.registration_status === "open" || r.registration_status === "coming_soon",
      metaDescription: r.meta_description || null,
      home_order: r.home_order || null,
      register_url: r.register_url || null,
      register_label: r.register_label || null,
      hidden: r.hidden === 1,
      repeatable: r.repeatable === 1,
      options,
    };
  });

  return new Response(JSON.stringify(programs), {
    headers: { "content-type": "application/json", "cache-control": "no-cache" },
  });
}

export async function handleRegistration(request, env) {
  // Per-IP cap. Legitimate guardians register once per child; this gives
  // generous headroom for a family registering 4-5 kids from the same
  // address while blocking automated signup floods.
  const REG_LIMIT = 5, REG_WINDOW = 24 * 60 * 60 * 1000;
  const ip = clientIpFor(request);
  if (!(await checkActionRateLimit(env, "registration", ip, REG_LIMIT, REG_WINDOW))) {
    return badRequest("Too many registrations from this network. Please try again tomorrow or contact support.", 429);
  }
  await recordActionAttempt(env, "registration", ip);

  const payload  = await parseJson(request);
  const student  = payload.student  || {};
  const guardian = payload.guardian || {};
  const acct     = payload.account  || {};

  const studentFullName    = requireField(student.fullName,   "Student full name");
  const studentDateOfBirth = requireField(student.dateOfBirth,"Date of birth");
  const studentMedium      = normalizeString(student.medium);
  const studentClassName   = requireField(student.className,  "Class");
  const studentGender      = requireField(student.gender,     "Gender");
  const studentSchool      = requireField(student.school,     "School");
  const studentDistrict    = requireField(student.district,   "District");
  const guardianFullName   = requireField(guardian.fullName,  "Guardian name");
  const guardianRelationship = requireField(guardian.relationship, "Relationship");
  const guardianPhone      = requireField(guardian.phone,     "Phone");
  const guardianEmail      = requireField(guardian.email,     "Guardian email").toLowerCase();
  const guardianAddress    = requireField(guardian.address,   "Address");
  const password           = requireField(acct.password,      "Password");
  const registrationType   = normalizeString(payload.registrationType) || "national-olympiad";
  const catalog = await loadCatalog(env);
  if (!catalog.has(registrationType)) {
    return badRequest("Invalid registration type.");
  }
  if (!catalog.registrationOpenFor(registrationType)) {
    return badRequest("Registration for this program is currently closed.", 409);
  }
  // District must be one of the 64 Bangladesh districts. canonicalDistrict
  // normalises case (so "dhaka" -> "Dhaka") and returns null on miss.
  const districtCanonical  = canonicalDistrict(studentDistrict);
  if (!districtCanonical) {
    return badRequest("District must be one of the 64 Bangladesh districts. Please pick from the list.");
  }
  const preferredVenue     = (registrationType.startsWith("national-olympiad") || registrationType === "national-quiz-competition") ? normalizeString(student.preferredVenue) : null;
  // Program options (Mock Test sessions, Prep Course subjects, and the
  // Olympiad's Math/Science/Both subject pick). These drive the actual price
  // at checkout, so we validate against the shared options config and store
  // the normalised id list.
  let programOptions = null;
  let normalizedOptions = [];
  if (catalog.programHasOptions(registrationType)) {
    const opt = catalog.validateAndPriceOptions(registrationType, payload.programOptions);
    if (!opt.ok) return badRequest(opt.error);
    normalizedOptions = opt.normalized;
    programOptions = JSON.stringify(opt.normalized);
  }

  // Preferred subject for the National Olympiad. The subject IS the radio
  // option the guardian picked: math-only / science-only already declare it,
  // so the client hides the field and the server derives it here. Only when
  // BOTH subjects are taken does the "Preferred Subject" field appear (asking
  // which to prioritise: math | science | both).
  const VALID_SUBJECTS     = ["math", "science", "both"];
  let preferredSubject     = null;
  if (registrationType === "national-olympiad") {
    const choice = normalizedOptions[0];
    if (choice === "both") {
      const explicit = (normalizeString(student.preferredSubject) || "").toLowerCase();
      if (!VALID_SUBJECTS.includes(explicit)) {
        return badRequest("Please select a preferred subject (Math, Science, or Both).");
      }
      preferredSubject = explicit;
    } else if (choice === "math" || choice === "science") {
      preferredSubject = choice;
    } else {
      return badRequest("Please select a subject for the Olympiad.");
    }
  }

  const sourcePage         = normalizeString(payload.sourcePage);
  const termsAccepted      = Boolean(payload.termsAccepted);

  if (!termsAccepted) return badRequest("Rules and regulations must be accepted.");
  if (!isEmail(guardianEmail)) return badRequest("Guardian email is not valid.");
  if (!isPhoneLike(guardianPhone)) return badRequest("Guardian phone number is not valid.");
  if (password.length < 8) return badRequest("Password must be at least 8 characters long.");

  // Age check: NQR students must be under 13 as of September 30 (IMSO cutoff).
  if (registrationType.startsWith("national-qualifying")) {
    const dob     = new Date(studentDateOfBirth);
    const cutoff  = new Date(`${new Date().getUTCFullYear()}-09-30`);
    const ageAtCutoff = cutoff.getUTCFullYear() - dob.getUTCFullYear()
      - (cutoff < new Date(cutoff.getUTCFullYear(), dob.getUTCMonth(), dob.getUTCDate()) ? 1 : 0);
    if (isNaN(dob.getTime())) return badRequest("Date of birth is not valid.");
    if (ageAtCutoff >= 13) return badRequest("Student must be under 13 years old as of September 30 to be eligible.");
  }
  // Quiz Competition: pre-primary to Class 3, both mediums.
  if (registrationType === "national-quiz-competition") {
    const validQuizClasses = ["Pre-primary", "Class 1", "Class 2", "Class 3"];
    if (!validQuizClasses.includes(studentClassName)) {
      return badRequest("BdMSO Quiz Competition is open to pre-primary through Class 3 only.");
    }
  }
  // National Olympiad: national curriculum ≤ Class 6, international curriculum ≤ Class 5.
  if (registrationType === "national-olympiad") {
    const nationalClasses      = ["Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6"];
    const internationalClasses = ["Class 1", "Class 2", "Class 3", "Class 4", "Class 5"];
    const curriculum = (studentMedium || "").toLowerCase();
    if (curriculum === "international" && !internationalClasses.includes(studentClassName)) {
      return badRequest("BdMSO National Olympiad (International curriculum) is open to Class 5 and below only.");
    }
    if (curriculum === "national" && !nationalClasses.includes(studentClassName)) {
      return badRequest("BdMSO National Olympiad (National curriculum) is open to Class 6 and below only.");
    }
  }

  const existing = await env.DB.prepare(
    "SELECT id FROM guardian_accounts WHERE email = ? LIMIT 1"
  ).bind(guardianEmail).first();
  // Same generic error whether email exists or not - prevents enumeration.
  if (existing) return badRequest("An account with this email already exists. If you've registered before, please log in instead.", 409);

  const guardianAccountId = createId("ga");
  const applicationId     = createId("app");
  const createdAt         = new Date().toISOString();
  const passwordSalt      = crypto.randomUUID();
  const passwordHash      = await hashPassword(password, passwordSalt, PBKDF2_ITERATIONS_CURRENT);

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO guardian_accounts (id, email, password_hash, password_salt, password_iterations, full_name, phone, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)"
    ).bind(guardianAccountId, guardianEmail, passwordHash, passwordSalt, PBKDF2_ITERATIONS_CURRENT, guardianFullName, guardianPhone, createdAt),
    env.DB.prepare(`
      INSERT INTO registrations (
        id, registration_type, student_full_name, student_date_of_birth, student_class_name,
        student_gender, student_medium, student_school, student_district, guardian_account_id, guardian_full_name,
        guardian_relationship, guardian_phone, guardian_email, guardian_address,
        preferred_venue, preferred_subject, program_options, terms_accepted, status, source_page, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      applicationId, registrationType, studentFullName, studentDateOfBirth, studentClassName,
      studentGender, studentMedium || null, studentSchool, districtCanonical, guardianAccountId, guardianFullName,
      guardianRelationship, guardianPhone, guardianEmail, guardianAddress,
      preferredVenue, preferredSubject, programOptions, termsAccepted ? 1 : 0, "submitted", sourcePage, createdAt
    )
  ]);

  const verifyToken = await createVerificationToken(env, guardianAccountId);
  const verifyUrl   = `${getBaseUrl(request)}/api/verify-email?token=${verifyToken}`;
  await sendVerificationEmail(env, guardianEmail, verifyUrl);

  const token = await createSession(env, guardianAccountId);
  return jsonResponse({
    ok: true, applicationId, token,
    accountId: guardianAccountId,
    fullName: guardianFullName,
    email: guardianEmail,
    emailVerified: false
  });
}

export async function handleVerifyEmail(request, env, url) {
  const token = url.searchParams.get("token");
  const base  = getBaseUrl(request);
  if (!token) return redirectTo(`${base}/dashboard.html?verified=invalid`);

  const row = await env.DB.prepare(
    "SELECT account_id, expires_at FROM email_verification_tokens WHERE token = ? LIMIT 1"
  ).bind(token).first();

  if (!row) return redirectTo(`${base}/dashboard.html?verified=invalid`);
  if (row.expires_at <= new Date().toISOString()) {
    await env.DB.prepare("DELETE FROM email_verification_tokens WHERE token = ?").bind(token).run();
    return redirectTo(`${base}/dashboard.html?verified=expired`);
  }

  await env.DB.batch([
    env.DB.prepare("UPDATE guardian_accounts SET email_verified = 1 WHERE id = ?").bind(row.account_id),
    env.DB.prepare("DELETE FROM email_verification_tokens WHERE account_id = ?").bind(row.account_id),
  ]);

  return redirectTo(`${base}/dashboard.html?verified=success`);
}

export async function handleResendVerification(request, env) {
  let account;
  try { account = await requireAuth(request, env); }
  catch (e) { return badRequest(e.message, e.status || 401); }

  const row = await env.DB.prepare(
    "SELECT email_verified FROM guardian_accounts WHERE id = ? LIMIT 1"
  ).bind(account.account_id).first();
  if (row?.email_verified) return jsonResponse({ ok: true, alreadyVerified: true });

  // Intentionally do NOT delete prior tokens here. Both emails go to the
  // same address, so both links are equivalent - invalidating the older
  // one just breaks the first email if the user happened to hit Resend
  // twice. handleVerifyEmail wipes every remaining token for the account
  // once any one of them is consumed, so cleanup happens at use time.
  // (Email CHANGE in /api/me/profile still deletes - old tokens were
  // sent to a different address and must die.)
  const verifyToken = await createVerificationToken(env, account.account_id);
  const verifyUrl   = `${getBaseUrl(request)}/api/verify-email?token=${verifyToken}`;
  await sendVerificationEmail(env, account.email, verifyUrl);

  return jsonResponse({ ok: true });
}

// ─── Password reset ───────────────────────────────────────────────────────────

// Mask an email for the "forgot email" hint: keep the first 2 and the
// last character of the local part, plus the full domain. So
// "sadianova1999@gmail.com" → "sa•••••••••9@gmail.com".
function maskEmail(email) {
  const [local, domain] = String(email).split("@");
  if (!domain || !local) return "•••";
  const head = local.slice(0, 2);
  const tail = local.length > 3 ? local.slice(-1) : "";
  const dots = "•".repeat(Math.max(3, local.length - head.length - tail.length));
  return `${head}${dots}${tail}@${domain}`;
}

// POST /api/forgot-password { email } - emails a reset link if the email
// belongs to an account. Always returns ok so the response cannot be used
// to probe which emails are registered.
export async function handleForgotPassword(request, env) {
  const FP_LIMIT = 10, FP_WINDOW = 15 * 60 * 1000;
  const ip = clientIpFor(request);
  if (!(await checkActionRateLimit(env, "forgot-password", ip, FP_LIMIT, FP_WINDOW))) {
    return badRequest("Too many requests. Please try again in a few minutes.", 429);
  }
  await recordActionAttempt(env, "forgot-password", ip);

  const payload = await parseJson(request);
  const email = (normalizeString(payload.email) || "").toLowerCase();
  if (!email) return badRequest("Email is required.");

  const account = await env.DB.prepare(
    "SELECT id, email FROM guardian_accounts WHERE email = ? LIMIT 1"
  ).bind(email).first();

  if (account) {
    await env.DB.prepare("DELETE FROM password_reset_tokens WHERE account_id = ?")
      .bind(account.id).run();
    const token    = await createPasswordResetToken(env, account.id);
    const resetUrl = `${getBaseUrl(request)}/reset-password?token=${token}`;
    await sendPasswordResetEmail(env, account.email, resetUrl);
  }
  return jsonResponse({ ok: true });
}

// POST /api/forgot-email { phone? | memberId? } - returns a masked email
// for the account identified by one of: a phone number on any of the
// account's registrations, or the BdMSO ID issued to that account.
// Pass exactly one of `phone` or `memberId`.
export async function handleForgotEmail(request, env) {
  const payload = await parseJson(request);
  const phoneRaw    = normalizeString(payload.phone);
  const memberIdRaw = normalizeString(payload.memberId);

  let row;
  if (memberIdRaw) {
    // Member IDs look like "BdMSO2604-001"; case-insensitive match,
    // tolerate stray spaces. Stored as-issued in guardian_accounts.member_id.
    const id = memberIdRaw.replace(/\s+/g, "").toUpperCase();
    row = await env.DB.prepare(
      "SELECT email FROM guardian_accounts WHERE UPPER(member_id) = ? LIMIT 1"
    ).bind(id).first();
  } else if (phoneRaw) {
    // Match on the 10-digit subscriber number (drop any 880 country code).
    const digits = phoneRaw.replace(/\D+/g, "");
    const subscriber = digits.length > 10 ? digits.slice(-10) : digits;
    if (subscriber.length < 10) return badRequest("Enter a valid phone number.");
    row = await env.DB.prepare(`
      SELECT a.email AS email FROM guardian_accounts a
      JOIN registrations r ON r.guardian_account_id = a.id
      WHERE r.guardian_phone LIKE ?
      LIMIT 1
    `).bind(`%${subscriber}`).first();
  } else {
    return badRequest("Enter a phone number or BdMSO ID.");
  }

  if (!row) return jsonResponse({ ok: true, found: false });
  return jsonResponse({ ok: true, found: true, maskedEmail: maskEmail(row.email) });
}

// POST /api/reset-password { token, password } - consumes a reset token
// and sets a new password, then drops the account's sessions.
export async function handleResetPassword(request, env) {
  const RP_LIMIT = 10, RP_WINDOW = 15 * 60 * 1000;
  const ip = clientIpFor(request);
  if (!(await checkActionRateLimit(env, "reset-password", ip, RP_LIMIT, RP_WINDOW))) {
    return badRequest("Too many requests. Please try again in a few minutes.", 429);
  }
  await recordActionAttempt(env, "reset-password", ip);

  const payload  = await parseJson(request);
  const token    = normalizeString(payload.token);
  const password = requireField(payload.password, "Password");
  if (!token) return badRequest("This reset link is invalid.");
  if (password.length < 8) return badRequest("Password must be at least 8 characters.");

  const row = await env.DB.prepare(
    "SELECT token, account_id, expires_at, used FROM password_reset_tokens WHERE token = ? LIMIT 1"
  ).bind(token).first();

  if (!row || row.used) {
    return badRequest("This reset link is invalid or has already been used.", 400);
  }
  if (row.expires_at <= new Date().toISOString()) {
    await env.DB.prepare("DELETE FROM password_reset_tokens WHERE token = ?").bind(token).run();
    return badRequest("This reset link has expired. Please request a new one.", 400);
  }

  const salt = crypto.randomUUID();
  const hash = await hashPassword(password, salt, PBKDF2_ITERATIONS_CURRENT);
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE guardian_accounts SET password_hash = ?, password_salt = ?, password_iterations = ? WHERE id = ?"
    ).bind(hash, salt, PBKDF2_ITERATIONS_CURRENT, row.account_id),
    env.DB.prepare("UPDATE password_reset_tokens SET used = 1 WHERE token = ?").bind(token),
    // Drop existing sessions so a stale/leaked session can't outlive the reset.
    env.DB.prepare("DELETE FROM sessions WHERE account_id = ?").bind(row.account_id),
  ]);
  return jsonResponse({ ok: true });
}

export async function handleSponsorship(request, env) {
  const SPON_LIMIT = 3, SPON_WINDOW = 60 * 60 * 1000;
  const ip = clientIpFor(request);
  if (!(await checkActionRateLimit(env, "sponsorship", ip, SPON_LIMIT, SPON_WINDOW))) {
    return badRequest("Too many enquiries from this network. Please try again later.", 429);
  }
  await recordActionAttempt(env, "sponsorship", ip);

  const payload      = await parseJson(request);
  const organization = requireField(payload.organization,  "Organization");
  const contactPerson= requireField(payload.contactPerson, "Contact person");
  const email        = requireField(payload.email,         "Email").toLowerCase();
  const phone        = normalizeString(payload.phone);
  const interest     = requireField(payload.interest,      "Interested in");
  const message      = requireField(payload.message,       "Message");
  const sourcePage   = normalizeString(payload.sourcePage);

  if (!isEmail(email)) return badRequest("Email address is not valid.");

  const leadId = createId("lead");
  await env.DB.prepare(
    "INSERT INTO sponsorship_enquiries (id, organization, contact_person, email, phone, interest, message, status, source_page, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(leadId, organization, contactPerson, email, phone, interest, message, "new", sourcePage, new Date().toISOString()).run();

  // Notify the partnerships inbox. Failure is non-blocking - the enquiry is already saved.
  sendSponsorshipNotification(env, { leadId, organization, contactPerson, email, phone, interest, message, sourcePage })
    .catch(err => console.log("[email-sponsorship] notify failed:", err.message));

  return jsonResponse({ ok: true, leadId });
}

export async function handleCreatePayment(request, env) {
  let account;
  try { account = await requireAuth(request, env); }
  catch (e) { return badRequest(e.message, e.status || 401); }

  // Per-account throttle. Prevents an authenticated attacker from
  // flooding shurjoPay - 5 creates per 15 min is more than any
  // legitimate retry pattern needs (form-resubmits go through
  // val_id reuse, not new payment rows).
  const PAY_LIMIT = 5, PAY_WINDOW = 15 * 60 * 1000;
  if (!(await checkActionRateLimit(env, "payment-create", account.account_id, PAY_LIMIT, PAY_WINDOW))) {
    return badRequest("Too many payment attempts. Please wait a few minutes and try again.", 429);
  }
  await recordActionAttempt(env, "payment-create", account.account_id);

  const verified = await env.DB.prepare(
    "SELECT email_verified FROM guardian_accounts WHERE id = ? LIMIT 1"
  ).bind(account.account_id).first();
  if (!verified?.email_verified) {
    return badRequest("Please verify your email address before making a payment.", 403);
  }

  const payload        = await parseJson(request);
  const registrationId = requireField(payload.registrationId, "Registration ID");

  const reg = await env.DB.prepare(
    "SELECT * FROM registrations WHERE id = ? AND guardian_account_id = ? LIMIT 1"
  ).bind(registrationId, account.account_id).first();
  if (!reg) return badRequest("Registration not found.", 404);
  if (reg.status === "cancelled") {
    return badRequest("This registration was cancelled. Please re-register to continue.", 409);
  }

  const alreadyPaid = await env.DB.prepare(
    "SELECT id FROM payments WHERE registration_id = ? AND status = 'paid' LIMIT 1"
  ).bind(registrationId).first();
  if (alreadyPaid) return badRequest("This registration has already been paid.");

  // Supersede any earlier still-pending attempt on this registration so retries
  // (or a cleared session) don't leave stale 'pending' rows cluttering the admin
  // dashboard. ShurjoPay checkout sessions are time-limited, so an abandoned
  // pending can't be resumed anyway - we always start a fresh one below. Scoped
  // to purpose='initial'; option-upgrade top-ups are tracked separately. If the
  // old gateway session somehow still completes, its callback matches by val_id
  // and still flips that row to 'paid'.
  await env.DB.prepare(
    "UPDATE payments SET status = 'expired', updated_at = ? WHERE registration_id = ? AND status = 'pending' AND purpose = 'initial'"
  ).bind(new Date().toISOString(), registrationId).run();

  // Programs with selectable options (Mock Test sessions, Prep Course
  // subjects) derive their price from the stored options list; the rest use the
  // flat catalog fee. null fee = "on enquiry".
  const catalog = await loadCatalog(env);
  let baseAmount;
  if (catalog.programHasOptions(reg.registration_type)) {
    let stored = [];
    try { stored = JSON.parse(reg.program_options || "[]"); } catch {}
    const opt = catalog.validateAndPriceOptions(reg.registration_type, stored);
    if (!opt.ok || opt.price == null) {
      return badRequest("This registration is missing its options selection. Please re-register or contact support.");
    }
    baseAmount = opt.price;
  } else {
    baseAmount = catalog.priceFor(reg.registration_type);
    if (baseAmount == null) {
      return badRequest("This program is by enquiry. Please email support@bdmso.org to confirm the fee.");
    }
  }
  let finalAmount   = baseAmount;
  const couponCode  = normalizeString(payload.couponCode)?.toUpperCase();

  if (couponCode) {
    const coupon = await env.DB.prepare(
      "SELECT * FROM coupons WHERE code = ? LIMIT 1"
    ).bind(couponCode).first();
    if (coupon &&
        (!coupon.expires_at || new Date(coupon.expires_at) >= new Date()) &&
        (!coupon.max_uses   || coupon.used_count < coupon.max_uses) &&
        (!coupon.applies_to || couponAppliesToType(coupon.applies_to, reg.registration_type))
    ) {
      finalAmount = coupon.discount_type === "percent"
        ? Math.round(baseAmount * (1 - coupon.discount_value / 100))
        : Math.max(0, baseAmount - coupon.discount_value);
      // used_count is incremented in the payment callback once payment is confirmed,
      // except for free registrations (amount=0) which complete immediately below.
    }
  }

  const amount = finalAmount;
  const tranId = createId("txn");
  const now    = new Date().toISOString();
  const base   = getBaseUrl(request);

  // Free registration - skip payment gateway entirely
  if (amount === 0) {
    const paymentId = createId("pay");
    const freeOps = [
      env.DB.prepare(
        "INSERT INTO payments (id, registration_id, amount, currency, tran_id, status, created_at, updated_at) VALUES (?, ?, 0, 'BDT', ?, 'paid', ?, ?)"
      ).bind(paymentId, registrationId, tranId, now, now),
      env.DB.prepare("UPDATE registrations SET status = 'paid' WHERE id = ?").bind(registrationId),
    ];
    if (couponCode) {
      freeOps.push(
        env.DB.prepare("UPDATE coupons SET used_count = used_count + 1 WHERE code = ?").bind(couponCode)
      );
    }
    await env.DB.batch(freeOps);
    try { await assignMemberIdAndSendReceipt(env, tranId, getBaseUrl(request)); }
    catch (err) { console.log("[create-payment/free] receipt error:", err.message); }
    return jsonResponse({ ok: true, free: true });
  }

  // Capture the caller's IP for shurjoPay's risk engine (required field).
  // Behind Cloudflare the real IP is in `cf-connecting-ip`; fall back to a
  // sane default so a missing header in local dev doesn't 400 the request.
  const clientIp = request.headers.get("cf-connecting-ip")
                || request.headers.get("x-forwarded-for")?.split(",")[0].trim()
                || "0.0.0.0";

  const config = getShurjopayConfig(env);
  let spRes;
  try {
    const tokenInfo = await shurjopayGetToken(config, env);
    spRes = await shurjopayCreatePayment(config, tokenInfo, {
      order_id:           tranId,
      // Live shurjoPay (engine.shurjopayment.com) parses `amount` as a
      // number and silently zeroes a stringified value, which surfaces
      // as a 0.00 BDT total on the hosted checkout. Sandbox coerces
      // strings to numbers and so worked fine. Always send the raw
      // number now.
      amount:             amount,
      client_ip:          clientIp,
      return_url:         `${base}/api/payment-callback`,
      cancel_url:         `${base}/api/payment-callback`,
      customer_name:      reg.guardian_full_name,
      customer_phone:     reg.guardian_phone,
      customer_email:     reg.guardian_email,
      customer_address:   reg.guardian_address || reg.student_district,
      customer_city:      reg.student_district,
      customer_post_code: "1000",
    });
  } catch (err) {
    return badRequest(err.message || "Payment gateway error. Please try again.");
  }

  // val_id starts out holding shurjoPay's order id. We need this because
  // the post-payment redirect identifies the txn by sp_order_id, not by
  // our merchant tran_id.
  const paymentId = createId("pay");
  await env.DB.prepare(
    "INSERT INTO payments (id, registration_id, amount, currency, tran_id, val_id, coupon_code, status, created_at, updated_at) VALUES (?, ?, ?, 'BDT', ?, ?, ?, 'pending', ?, ?)"
  ).bind(paymentId, registrationId, amount, tranId, spRes.sp_order_id || null, couponCode || null, now, now).run();

  return jsonResponse({ ok: true, checkoutURL: spRes.checkout_url });
}

// Extracts shurjoPay's order id from a callback. The browser return puts
// it in the query string (?order_id=); the server-to-server IPN puts it
// in the POST body (JSON or form-encoded). Both carry shurjoPay's own
// order id - misleading name, confirmed against their usage example.
async function extractSpOrderId(request, url) {
  const fromQuery = url.searchParams.get("order_id");
  if (fromQuery) return fromQuery;
  if (request.method === "GET" || request.method === "HEAD") return null;
  let raw = "";
  try { raw = await request.text(); } catch { return null; }
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    return j.order_id || j.sp_order_id || j.spOrderId || null;
  } catch { /* not JSON - fall through */ }
  try {
    const p = new URLSearchParams(raw);
    return p.get("order_id") || p.get("sp_order_id") || null;
  } catch { /* not form-encoded */ }
  return null;
}

// Handles BOTH the browser return and shurjoPay's server-to-server IPN at
// the same URL (the merchant account's notification address is set to
// /api/payment-callback). The browser gets a redirect to the dashboard;
// the IPN gets a plain 200. The "mark paid" step is claimed atomically, so
// whichever of the two arrives first does the work and the other is a
// clean no-op - this is what closes the "paid but the browser never came
// back" gap. Either way the payment is re-verified against shurjoPay's
// verification API, so a forged IPN body cannot mark anything paid.
export async function handlePaymentCallback(request, env, url) {
  const base   = getBaseUrl(request);
  // GET / an HTML navigation = the browser being redirected back (wants a
  // redirect). Anything else = the IPN server call (wants a plain 200).
  const isBrowser = request.method === "GET"
    || request.headers.get("sec-fetch-mode") === "navigate"
    || (request.headers.get("accept") || "").includes("text/html");
  const done = (outcome) => isBrowser
    ? redirectTo(`${base}/dashboard?payment=${outcome}`)
    : jsonResponse({ ok: true, outcome });

  const spOrderId = await extractSpOrderId(request, url);
  if (!spOrderId) return done("failed");

  const payment = await env.DB.prepare(
    "SELECT id, tran_id, coupon_code, registration_id, status, purpose, proposed_options, amount FROM payments WHERE val_id = ? LIMIT 1"
  ).bind(spOrderId).first();
  if (!payment) return done("failed");

  // Already settled by the other channel (browser vs IPN race) - no-op.
  if (payment.status === "paid") return done("success");

  try {
    const config    = getShurjopayConfig(env);
    const tokenInfo = await shurjopayGetToken(config, env);
    const result    = await shurjopayVerify(config, tokenInfo, spOrderId);
    const now       = new Date().toISOString();
    const status    = result.transaction_status || result.sp_message || "Unknown";

    // shurjoPay returns "Success" on a confirmed paid txn for wallet rails
    // (bKash, Nagad). Card rails settle via the issuer bank and come back
    // with ISO 8583 "00" (Approved) in transaction_status instead, so accept
    // both. Anything else (Cancel / Failed / Initiated / Pending) is treated
    // as not-yet-paid.
    const isSuccess = status === "Success" || status === "00";
    if (!isSuccess) {
      await env.DB.prepare(
        "UPDATE payments SET status = 'failed', gateway_status = ?, updated_at = ? WHERE val_id = ? AND status != 'paid'"
      ).bind(status, now, spOrderId).run();
      return done(status.toLowerCase() === "cancel" ? "cancelled" : "failed");
    }

    // Amount sanity check. We trust shurjoPay's verify response, but the
    // gateway's returned amount must be >= what we billed. Anything less
    // means a tampered callback / settlement mismatch - we'd be granting
    // a paid status against an underpayment. Flip to 'failed' so it's
    // visible in admin and doesn't auto-mark paid.
    const verifiedAmount = Number(result.amount ?? result.txn_amount ?? NaN);
    const billedAmount   = Number(payment.amount);
    if (!Number.isFinite(verifiedAmount) || verifiedAmount + 0.01 < billedAmount) {
      console.log(`[payment-callback] amount mismatch val_id=${spOrderId} billed=${billedAmount} verified=${verifiedAmount}`);
      await env.DB.prepare(
        "UPDATE payments SET status = 'failed', gateway_status = ?, updated_at = ? WHERE val_id = ? AND status != 'paid'"
      ).bind(`AmountMismatch:${verifiedAmount}`, now, spOrderId).run();
      return done("failed");
    }

    // Atomically claim the payment: only one caller flips a non-paid row
    // to paid. meta.changes tells us whether THIS call won the race, so
    // the side effects (member id, receipt, coupon count) run exactly once.
    const claim = await env.DB.prepare(
      "UPDATE payments SET status = 'paid', gateway_status = 'Success', method = ?, updated_at = ? WHERE val_id = ? AND status != 'paid'"
    ).bind(result.method || null, now, spOrderId).run();

    if (!claim?.meta || claim.meta.changes === 0) {
      return done("success");  // the other channel claimed it first
    }

    // Option-upgrade top-ups: don't flip registration status (already
    // paid) and don't mint a member id - the change is purely the option
    // swap. Once committed we audit the change and re-issue the receipt
    // showing the new selection + cumulative total.
    if (payment.purpose === "option-upgrade") {
      const proposed = payment.proposed_options || "[]";
      const currentRow = await env.DB.prepare(
        "SELECT program_options FROM registrations WHERE id = ? LIMIT 1"
      ).bind(payment.registration_id).first();
      const fromIds = (() => {
        try { return JSON.parse(currentRow?.program_options || "[]"); } catch { return []; }
      })();
      const toIds = (() => {
        try { return JSON.parse(proposed); } catch { return []; }
      })();

      // Price the change against the catalog at commit time. If the
      // catalog moved while the guardian was on the gateway page we still
      // log the price the guardian actually paid (payment.amount).
      let regType = null;
      try {
        const r = await env.DB.prepare(
          "SELECT registration_type FROM registrations WHERE id = ? LIMIT 1"
        ).bind(payment.registration_id).first();
        regType = r?.registration_type || null;
      } catch {}
      const catalog = await loadCatalog(env);
      const diff = regType ? catalog.computeOptionDiff(regType, fromIds, toIds) : null;

      const ops = [
        env.DB.prepare("UPDATE registrations SET program_options = ? WHERE id = ?")
          .bind(proposed, payment.registration_id),
        env.DB.prepare(`
          INSERT INTO registration_option_changes
            (registration_id, from_options, to_options, from_price, to_price, delta,
             action, payment_id, actor_account_id, acknowledged_no_refund, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'upgrade', ?, (
            SELECT guardian_account_id FROM registrations WHERE id = ? LIMIT 1
          ), 0, ?)
        `).bind(
          payment.registration_id,
          JSON.stringify(fromIds),
          proposed,
          diff?.fromPrice ?? 0,
          diff?.toPrice ?? 0,
          diff?.delta ?? 0,
          payment.id,
          payment.registration_id,
          now,
        ),
      ];
      await env.DB.batch(ops);

      try { await sendUpdatedReceiptForRegistration(env, payment.registration_id, getBaseUrl(request)); }
      catch (err) { console.log("[payment-callback/option-upgrade] receipt error:", err.message); }

      return done("success");
    }

    const ops = [
      env.DB.prepare("UPDATE registrations SET status = 'paid' WHERE id = ?")
        .bind(payment.registration_id),
    ];
    if (payment.coupon_code) {
      ops.push(
        env.DB.prepare("UPDATE coupons SET used_count = used_count + 1 WHERE code = ?")
          .bind(payment.coupon_code)
      );
    }
    await env.DB.batch(ops);

    try { await assignMemberIdAndSendReceipt(env, payment.tran_id, getBaseUrl(request)); }
    catch (err) { console.log("[payment-callback] receipt error:", err.message); }

    return done("success");
  } catch (err) {
    console.log("[payment-callback] shurjoPay error:", err.message);
    return done("failed");
  }
}

export async function handleAddEnrollment(request, env) {
  let account;
  try { account = await requireAuth(request, env); }
  catch (e) { return badRequest(e.message, e.status || 401); }

  const payload          = await parseJson(request);
  const registrationType = normalizeString(payload.registrationType) || "national-olympiad";
  const catalog = await loadCatalog(env);
  if (!catalog.has(registrationType)) {
    return badRequest("Invalid registration type.");
  }
  if (!catalog.registrationOpenFor(registrationType)) {
    return badRequest("Registration for this program is currently closed.", 409);
  }

  const existing = await env.DB.prepare(
    "SELECT * FROM registrations WHERE guardian_account_id = ? ORDER BY created_at DESC LIMIT 1"
  ).bind(account.account_id).first();
  if (!existing) return badRequest("No existing registration found. Please complete a full registration first.", 404);

  // Repeatable programs (e.g. the BdMSO Mock Test) allow more than one
  // enrollment - a guardian can come back later and book additional
  // sessions. Other programs stay one-enrollment-per-student.
  const repeatable = catalog.repeatable(registrationType);
  if (!repeatable) {
    const duplicate = await env.DB.prepare(
      "SELECT id FROM registrations WHERE guardian_account_id = ? AND registration_type = ? AND status != 'cancelled' LIMIT 1"
    ).bind(account.account_id, registrationType).first();
    if (duplicate) return badRequest("Your child is already enrolled in this program.", 409);
  }

  // Olympiad and Quiz are mutually exclusive - only one competition per student.
  const COMPETITIONS = ["national-olympiad", "national-quiz-competition"];
  if (COMPETITIONS.includes(registrationType)) {
    const otherType = COMPETITIONS.find(t => t !== registrationType);
    const otherComp = await env.DB.prepare(
      "SELECT id FROM registrations WHERE guardian_account_id = ? AND registration_type = ? AND status != 'cancelled' LIMIT 1"
    ).bind(account.account_id, otherType).first();
    if (otherComp) return badRequest("Each student may register for either the BdMSO National Round or the BdMSO Quiz Competition, not both.", 409);
  }

  // Program options (Mock Test sessions, Prep Course subjects) carry
  // the per-program selection. Without them programs that price by
  // option would charge ৳0 at checkout, so we enforce the same
  // validation as the full submit-registration flow.
  let programOptions = null;
  if (catalog.programHasOptions(registrationType)) {
    const opt = catalog.validateAndPriceOptions(registrationType, payload.programOptions);
    if (!opt.ok) return badRequest(opt.error);
    // Duplicate guard: if any of the proposed ids are already held by
    // another non-cancelled registration on this account for the same
    // program, refuse. A guardian who tries to book "Mock Test 1 - Math"
    // on a second mock-test row gets a clear error pointing at the
    // already-taken sessions instead of silently double-paying.
    const taken = await getTakenOptionIds(env, account.account_id, registrationType);
    const overlap = opt.normalized.filter((id) => taken.has(id));
    if (overlap.length) {
      const labels = catalog.getOptionLabels(registrationType, overlap).join(", ");
      return badRequest(`Already enrolled in: ${labels}. Pick a different selection or edit the existing registration instead.`, 409);
    }
    programOptions = JSON.stringify(opt.normalized);
  }

  const applicationId = createId("app");
  const createdAt     = new Date().toISOString();

  // The BdMSO ID lives on the guardian account, not on registration
  // rows - so a new enrollment doesn't carry one; the account's ID
  // already covers this student across every program.
  await env.DB.prepare(`
    INSERT INTO registrations (
      id, registration_type, student_full_name, student_date_of_birth, student_class_name,
      student_gender, student_medium, student_school, student_district, guardian_account_id, guardian_full_name,
      guardian_relationship, guardian_phone, guardian_email, guardian_address,
      program_options, terms_accepted, status, source_page, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'submitted', 'programs.html', ?)
  `).bind(
    applicationId, registrationType,
    existing.student_full_name, existing.student_date_of_birth,
    existing.student_class_name, existing.student_gender,
    existing.student_medium || null,
    existing.student_school, existing.student_district,
    account.account_id, existing.guardian_full_name,
    existing.guardian_relationship, existing.guardian_phone,
    account.email, existing.guardian_address,
    programOptions,
    createdAt
  ).run();

  return jsonResponse({ ok: true, applicationId });
}

export async function handleValidateCoupon(request, env, url) {
  const code = url.searchParams.get("code")?.trim().toUpperCase();
  const type = url.searchParams.get("type");
  if (!code) return badRequest("Coupon code is required.");

  const coupon = await env.DB.prepare(
    "SELECT * FROM coupons WHERE code = ? LIMIT 1"
  ).bind(code).first();

  if (!coupon) return badRequest("Invalid coupon code.", 404);
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) return badRequest("This coupon has expired.", 410);
  if (coupon.max_uses && coupon.used_count >= coupon.max_uses) return badRequest("This coupon has reached its usage limit.", 410);
  if (coupon.applies_to && type) {
    if (!couponAppliesToType(coupon.applies_to, type)) return badRequest("This coupon is not valid for this program.", 422);
  }

  return jsonResponse({
    ok: true,
    discountType: coupon.discount_type,
    discountValue: coupon.discount_value,
    description: coupon.discount_type === "percent"
      ? `${coupon.discount_value}% off`
      : `৳${Number(coupon.discount_value).toLocaleString()} off`
  });
}

// (Removed) grantPrepFreeMockTests - the Prep Course no longer auto-creates
// separate free Mock Test registrations. Mock tests are now bundled into the
// Prep Course package itself (see each subject option in programs-detail.json).
