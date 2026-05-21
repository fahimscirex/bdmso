// Public-tier API handlers - no auth or auth required only via Bearer token.
// All handlers preserve the exact behavior from the pre-Hono single-file
// worker. They take (request, env [, url]) and return a Response.

import { jsonResponse, badRequest, redirectTo, createId, couponAppliesToType, parseJson, getBaseUrl } from "../lib/util.js";
import { normalizeString, requireField, isEmail, isPhoneLike } from "../lib/validation.js";
import { hashPassword, PBKDF2_ITERATIONS_CURRENT, DUMMY_HASH_SALT } from "../lib/crypto.js";
import { createSession, extractToken, requireAuth } from "../lib/sessions.js";
import { checkLoginRateLimit, recordLoginAttempt } from "../lib/rate-limit.js";
import { createVerificationToken, sendVerificationEmail, sendSponsorshipNotification, assignMemberIdAndSendReceipt } from "../lib/email.js";
import { PROGRAM_PRICES, PROGRAM_NAMES } from "../lib/programs.js";
import { programHasOptions, validateAndPriceOptions, prepFreeMockSlots } from "../lib/program-options.js";
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

  const storedIterations = account.password_iterations || 120000;
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
  const registrations = (rows.results || []).map((r) => ({
    ...r,
    program_label: PROGRAM_NAMES[r.registration_type] || r.registration_type,
    program_price: effectiveProgramPrice(r),
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
      return badRequest("This program is by enquiry. Please email hello@bdmso.org to confirm the fee.");
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
    try { await grantPrepFreeMockTests(env, registrationId); } catch (err) {
      console.log("[create-payment/free] prep bonus error:", err.message);
    }
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

export async function handlePaymentCallback(request, env, url) {
  const base       = getBaseUrl(request);
  // shurjoPay appends ?order_id=<sp_order_id> on the return redirect.
  // Misleading name - it's their order id, not the merchant's. Confirmed
  // against the official usage example (return.js).
  const spOrderId = url.searchParams.get("order_id");
  if (!spOrderId) return redirectTo(`${base}/dashboard?payment=failed`);

  // Reject callbacks for unknown or already-processed payments.
  const pendingPayment = await env.DB.prepare(
    "SELECT id, tran_id, coupon_code, registration_id FROM payments WHERE val_id = ? AND status = 'pending' LIMIT 1"
  ).bind(spOrderId).first();
  if (!pendingPayment) return redirectTo(`${base}/dashboard?payment=failed`);

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
        "UPDATE payments SET status = 'failed', gateway_status = ?, updated_at = ? WHERE val_id = ?"
      ).bind(status, now, spOrderId).run();
      return redirectTo(`${base}/dashboard?payment=${status.toLowerCase() === "cancel" ? "cancelled" : "failed"}`);
    }

    const batchOps = [
      env.DB.prepare(
        "UPDATE payments SET status = 'paid', gateway_status = 'Success', updated_at = ? WHERE val_id = ?"
      ).bind(now, spOrderId),
      env.DB.prepare(`
        UPDATE registrations SET status = 'paid'
        WHERE id = (SELECT registration_id FROM payments WHERE val_id = ? LIMIT 1)
      `).bind(spOrderId),
    ];
    if (pendingPayment.coupon_code) {
      batchOps.push(
        env.DB.prepare("UPDATE coupons SET used_count = used_count + 1 WHERE code = ?")
          .bind(pendingPayment.coupon_code)
      );
    }
    await env.DB.batch(batchOps);

    try { await assignMemberIdAndSendReceipt(env, pendingPayment.tran_id, getBaseUrl(request)); } catch (err) {
      console.log("[payment-callback] receipt error:", err.message);
    }

    // BdMSO Preparatory bonus: 2 free Mock Tests in the chosen
    // subject(s). After a Prep payment lands, auto-create a
    // mock-test row for the same student (already-paid, amount=0)
    // unless one already exists.
    try { await grantPrepFreeMockTests(env, pendingPayment.registration_id); } catch (err) {
      console.log("[payment-callback] prep bonus error:", err.message);
    }

    return redirectTo(`${base}/dashboard?payment=success`);
  } catch (err) {
    console.log("[payment-callback] shurjoPay error:", err.message);
    return redirectTo(`${base}/dashboard?payment=failed`);
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

// BdMSO Preparatory bonus: when a Prep payment is confirmed, create a
// dedicated paid (amount=0) Mock Test row for the same student tied to the
// 2 sessions in their chosen subject(s). The bonus always lives in its own
// row - it is never merged into a guardian's own mock-test registration.
// Idempotent: a re-run finds the bonus row it created earlier and merges
// any missing option ids into it rather than creating a duplicate.
async function grantPrepFreeMockTests(env, registrationId) {
  const prep = await env.DB.prepare(
    "SELECT * FROM registrations WHERE id = ? LIMIT 1"
  ).bind(registrationId).first();
  if (!prep || prep.registration_type !== "bdmso-preparatory") return;

  let subjects = [];
  try { subjects = JSON.parse(prep.program_options || "[]"); } catch {}
  const slotIds = prepFreeMockSlots(subjects);
  if (!slotIds.length) return;

  // Idempotency only: look for a mock-test row THIS grant created earlier
  // (source_page = 'prep-bonus'). We deliberately never merge into a
  // guardian's own mock-test registration - if that row were still unpaid
  // and held paid sessions, flipping it to 'paid' here would hand them
  // those paid sessions for free. The bonus stays in its own dedicated row.
  // Scoped by account, not student name: one account = one student, and
  // the name is editable, so account + source_page is the stable key.
  const bonusRow = await env.DB.prepare(`
    SELECT id, program_options FROM registrations
    WHERE guardian_account_id = ?
      AND registration_type   = 'mock-test'
      AND source_page         = 'prep-bonus'
      AND status != 'cancelled'
    LIMIT 1
  `).bind(prep.guardian_account_id).first();

  if (bonusRow) {
    // Re-run: merge any missing bonus slots into the existing bonus row.
    let current = [];
    try { current = JSON.parse(bonusRow.program_options || "[]"); } catch {}
    const merged = Array.from(new Set([...current, ...slotIds]));
    await env.DB.prepare(
      "UPDATE registrations SET program_options = ?, status = 'paid' WHERE id = ?"
    ).bind(JSON.stringify(merged), bonusRow.id).run();
    return;
  }

  const now = new Date().toISOString();
  const mockId = createId("app");
  const paymentId = createId("pay");
  const tranId = `prep-bonus-${registrationId}`;

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO registrations (
        id, registration_type, student_full_name, student_date_of_birth, student_class_name,
        student_gender, student_medium, student_school, student_district,
        guardian_account_id, guardian_full_name, guardian_relationship, guardian_phone,
        guardian_email, guardian_address, program_options, terms_accepted,
        status, source_page, created_at
      ) VALUES (?, 'mock-test', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'paid', 'prep-bonus', ?)
    `).bind(
      mockId,
      prep.student_full_name, prep.student_date_of_birth, prep.student_class_name,
      prep.student_gender, prep.student_medium, prep.student_school, prep.student_district,
      prep.guardian_account_id, prep.guardian_full_name, prep.guardian_relationship,
      prep.guardian_phone, prep.guardian_email, prep.guardian_address,
      JSON.stringify(slotIds),
      now
    ),
    env.DB.prepare(`
      INSERT INTO payments (id, registration_id, tran_id, val_id, amount, status, gateway_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, 'paid', 'PrepBonus', ?, ?)
    `).bind(paymentId, mockId, tranId, tranId, now, now),
  ]);
}
