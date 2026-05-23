// Public-tier API handlers - no auth or auth required only via Bearer token.
// All handlers preserve the exact behavior from the pre-Hono single-file
// worker. They take (request, env [, url]) and return a Response.

import { jsonResponse, badRequest, redirectTo, createId, couponAppliesToType, parseJson, getBaseUrl } from "../lib/util.js";
import { normalizeString, requireField, isEmail, isPhoneLike } from "../lib/validation.js";
import { hashPassword, PBKDF2_ITERATIONS_CURRENT, DUMMY_HASH_SALT } from "../lib/crypto.js";
import { createSession, extractToken, requireAuth } from "../lib/sessions.js";
import { checkLoginRateLimit, recordLoginAttempt } from "../lib/rate-limit.js";
import { createVerificationToken, sendVerificationEmail, sendSponsorshipNotification, assignMemberIdAndSendReceipt, createPasswordResetToken, sendPasswordResetEmail } from "../lib/email.js";
import { PROGRAM_PRICES, PROGRAM_NAMES } from "../lib/programs.js";
import { programHasOptions, validateAndPriceOptions, getProgramOptions } from "../lib/program-options.js";
import CATALOG from "../../public/data/programs-detail.json";

// Catalog lookup by slug - for the registration on/off + hidden flags.
const CATALOG_BY_SLUG = Object.fromEntries(CATALOG.map((p) => [p.slug, p]));

// A program accepts new registrations only when it exists, isn't
// hidden, isn't explicitly closed (registration: false), and today
// falls inside its registration window (registrationStarts/Ends).
// An "upcoming" program with a future start date is not enrollable.
function registrationOpenFor(slug) {
  const p = CATALOG_BY_SLUG[slug];
  if (!p) return false;
  if (p.hidden) return false;
  if (p.registration === false) return false;
  const today = new Date().toISOString().slice(0, 10);
  if (p.registrationStarts && today < p.registrationStarts) return false;
  if (p.registrationEnds && today > p.registrationEnds) return false;
  return true;
}

// Effective fee for a registration row. Option-priced programs (Mock
// Test, Prep Course) derive their fee from the stored options; the
// rest use the flat catalog price. Returns null for "on enquiry".
function effectiveProgramPrice(reg) {
  if (programHasOptions(reg.registration_type)) {
    let opts = [];
    try { opts = JSON.parse(reg.program_options || "[]"); } catch { /* ignore */ }
    const priced = validateAndPriceOptions(reg.registration_type, opts);
    return priced.ok ? (priced.price ?? null) : null;
  }
  return PROGRAM_PRICES[reg.registration_type] ?? null;
}
import { getShurjopayConfig, shurjopayGetToken, shurjopayCreatePayment, shurjopayVerify } from "../lib/shurjopay.js";
import { canonicalDistrict } from "../lib/districts.js";

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
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(token).run();
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
             p.updated_at AS payment_date
      FROM registrations r
      LEFT JOIN payments p ON p.id = (
        SELECT id FROM payments WHERE registration_id = r.id ORDER BY created_at DESC LIMIT 1
      )
      WHERE r.guardian_account_id = ?
      ORDER BY r.created_at DESC
    `).bind(account.account_id).all(),
  ]);

  // Enrich each registration with the program's display label + fee,
  // derived from the catalog (programs-detail.json). This way the
  // dashboard/SPAs never hard-code program names or prices.
  // option_labels resolves the chosen option ids (e.g. mock-test sessions,
  // prep-course subject) to human labels so cards/receipts can show which.
  const optionLabelsFor = (r) => {
    const cfg = getProgramOptions(r.registration_type);
    if (!cfg) return [];
    let ids = [];
    try { ids = JSON.parse(r.program_options || "[]"); } catch { return []; }
    return (Array.isArray(ids) ? ids : [])
      .map((id) => cfg.items.find((it) => it.id === id)?.label)
      .filter(Boolean);
  };
  const registrations = (rows.results || []).map((r) => ({
    ...r,
    program_label: PROGRAM_NAMES[r.registration_type] || r.registration_type,
    program_price: effectiveProgramPrice(r),
    option_labels: optionLabelsFor(r),
  }));

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

export async function handleRegistration(request, env) {
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
  if (!Object.prototype.hasOwnProperty.call(PROGRAM_PRICES, registrationType)) {
    return badRequest("Invalid registration type.");
  }
  if (!registrationOpenFor(registrationType)) {
    return badRequest("Registration for this program is currently closed.", 409);
  }
  // District must be one of the 64 Bangladesh districts. canonicalDistrict
  // normalises case (so "dhaka" -> "Dhaka") and returns null on miss.
  const districtCanonical  = canonicalDistrict(studentDistrict);
  if (!districtCanonical) {
    return badRequest("District must be one of the 64 Bangladesh districts. Please pick from the list.");
  }
  const preferredVenue     = (registrationType.startsWith("national-olympiad") || registrationType === "national-quiz-competition") ? normalizeString(student.preferredVenue) : null;
  // Preferred subject is only meaningful for the National Olympiad
  // ('math' | 'science' | 'both'). Anything else is rejected.
  const VALID_SUBJECTS     = ["math", "science", "both"];
  const subjectRaw         = registrationType === "national-olympiad" ? (normalizeString(student.preferredSubject) || "").toLowerCase() : "";
  if (registrationType === "national-olympiad" && !VALID_SUBJECTS.includes(subjectRaw)) {
    return badRequest("Please select a preferred subject (Math, Science, or Both).");
  }
  const preferredSubject   = subjectRaw || null;

  // Program options (Mock Test sessions, Prep Course subjects). These
  // drive the actual price at checkout, so we validate against the
  // shared options config and only store the normalised id list.
  let programOptions = null;
  if (programHasOptions(registrationType)) {
    const opt = validateAndPriceOptions(registrationType, payload.programOptions);
    if (!opt.ok) return badRequest(opt.error);
    programOptions = JSON.stringify(opt.normalized);
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

  await env.DB.prepare("DELETE FROM email_verification_tokens WHERE account_id = ?").bind(account.account_id).run();
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

// POST /api/forgot-email { phone } - returns a masked email for the account
// whose registrations carry that Bangladesh mobile number.
export async function handleForgotEmail(request, env) {
  const payload = await parseJson(request);
  const digits  = (normalizeString(payload.phone) || "").replace(/\D+/g, "");
  // Match on the 10-digit subscriber number (drop any 880 country code).
  const subscriber = digits.length > 10 ? digits.slice(-10) : digits;
  if (subscriber.length < 10) return badRequest("Enter a valid phone number.");

  const row = await env.DB.prepare(`
    SELECT a.email AS email FROM guardian_accounts a
    JOIN registrations r ON r.guardian_account_id = a.id
    WHERE r.guardian_phone LIKE ?
    LIMIT 1
  `).bind(`%${subscriber}`).first();

  if (!row) return jsonResponse({ ok: true, found: false });
  return jsonResponse({ ok: true, found: true, maskedEmail: maskEmail(row.email) });
}

// POST /api/reset-password { token, password } - consumes a reset token
// and sets a new password, then drops the account's sessions.
export async function handleResetPassword(request, env) {
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

  // Programs with selectable options (Mock Test sessions, Prep Course
  // subjects) derive their price from the stored options list. The
  // PROGRAM_PRICES value is just the base/unit; the options config
  // computes the actual total.
  let baseAmount;
  if (programHasOptions(reg.registration_type)) {
    let stored = [];
    try { stored = JSON.parse(reg.program_options || "[]"); } catch {}
    const opt = validateAndPriceOptions(reg.registration_type, stored);
    if (!opt.ok || opt.price == null) {
      return badRequest("This registration is missing its options selection. Please re-register or contact support.");
    }
    baseAmount = opt.price;
  } else {
    baseAmount = PROGRAM_PRICES[reg.registration_type];
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
      amount:             String(amount),
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
    "SELECT tran_id, coupon_code, registration_id, status FROM payments WHERE val_id = ? LIMIT 1"
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

    // shurjoPay returns "Success" on a confirmed paid txn. Anything else
    // (Cancel / Failed / Initiated / Pending) is treated as not-yet-paid.
    if (status !== "Success") {
      await env.DB.prepare(
        "UPDATE payments SET status = 'failed', gateway_status = ?, updated_at = ? WHERE val_id = ? AND status != 'paid'"
      ).bind(status, now, spOrderId).run();
      return done(status.toLowerCase() === "cancel" ? "cancelled" : "failed");
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
  if (!Object.prototype.hasOwnProperty.call(PROGRAM_PRICES, registrationType)) {
    return badRequest("Invalid registration type.");
  }
  if (!registrationOpenFor(registrationType)) {
    return badRequest("Registration for this program is currently closed.", 409);
  }

  const existing = await env.DB.prepare(
    "SELECT * FROM registrations WHERE guardian_account_id = ? ORDER BY created_at DESC LIMIT 1"
  ).bind(account.account_id).first();
  if (!existing) return badRequest("No existing registration found. Please complete a full registration first.", 404);

  // Repeatable programs (e.g. the BdMSO Mock Test) allow more than one
  // enrollment - a guardian can come back later and book additional
  // sessions. Other programs stay one-enrollment-per-student.
  const repeatable = CATALOG_BY_SLUG[registrationType]?.repeatable === true;
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
  if (programHasOptions(registrationType)) {
    const opt = validateAndPriceOptions(registrationType, payload.programOptions);
    if (!opt.ok) return badRequest(opt.error);
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
