// Public-tier API handlers — no auth or auth required only via Bearer token.
// All handlers preserve the exact behavior from the pre-Hono single-file
// worker. They take (request, env [, url]) and return a Response.

import { jsonResponse, badRequest, redirectTo, createId, couponAppliesToType, parseJson, getBaseUrl } from "../lib/util.js";
import { normalizeString, requireField, isEmail, isPhoneLike } from "../lib/validation.js";
import { hashPassword, PBKDF2_ITERATIONS_CURRENT, DUMMY_HASH_SALT } from "../lib/crypto.js";
import { createSession, extractToken, requireAuth } from "../lib/sessions.js";
import { checkLoginRateLimit, recordLoginAttempt } from "../lib/rate-limit.js";
import { createVerificationToken, sendVerificationEmail, sendSponsorshipNotification, assignMemberIdAndSendReceipt } from "../lib/email.js";
import { PROGRAM_PRICES } from "../lib/programs.js";
import { getBkashConfig, bkashGrantToken, bkashCreatePayment, bkashExecutePayment } from "../lib/bkash.js";

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
      SELECT r.id, r.registration_type, r.student_full_name, r.student_class_name,
             r.student_gender, r.student_school, r.student_district, r.status, r.created_at,
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

  return jsonResponse({
    ok: true,
    account: {
      fullName: account.full_name,
      email: account.email,
      role: account.role || "guardian",
      emailVerified: !!acctRow?.email_verified,
      memberId: acctRow?.member_id || null
    },
    registrations: rows.results
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
  const registrationType   = normalizeString(payload.registrationType) || "national-qualifying-round";
  if (!Object.prototype.hasOwnProperty.call(PROGRAM_PRICES, registrationType)) {
    return badRequest("Invalid registration type.");
  }
  const preferredVenue     = (registrationType.startsWith("national-qualifying") || registrationType === "national-quiz-competition") ? normalizeString(student.preferredVenue) : null;
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
  // National Olympiad: bangla medium ≤ Class 6, english medium ≤ Class 5.
  if (registrationType === "national-qualifying-round") {
    const banglaClasses  = ["Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6"];
    const englishClasses = ["Class 1", "Class 2", "Class 3", "Class 4", "Class 5"];
    const medium = (studentMedium || "").toLowerCase();
    if (medium === "english" && !englishClasses.includes(studentClassName)) {
      return badRequest("BdMSO National Round (English medium) is open to Class 5 and below only.");
    }
    if (medium === "bangla" && !banglaClasses.includes(studentClassName)) {
      return badRequest("BdMSO National Round (Bangla medium) is open to Class 6 and below only.");
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
        preferred_venue, terms_accepted, status, source_page, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      applicationId, registrationType, studentFullName, studentDateOfBirth, studentClassName,
      studentGender, studentMedium || null, studentSchool, studentDistrict, guardianAccountId, guardianFullName,
      guardianRelationship, guardianPhone, guardianEmail, guardianAddress,
      preferredVenue, termsAccepted ? 1 : 0, "submitted", sourcePage, createdAt
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

  const alreadyPaid = await env.DB.prepare(
    "SELECT id FROM payments WHERE registration_id = ? AND status = 'paid' LIMIT 1"
  ).bind(registrationId).first();
  if (alreadyPaid) return badRequest("This registration has already been paid.");

  const baseAmount  = PROGRAM_PRICES[reg.registration_type] ?? 1000;
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
    try { await assignMemberIdAndSendReceipt(env, tranId); } catch {}
    return jsonResponse({ ok: true, free: true });
  }

  const bkashConfig = getBkashConfig(env);
  let bkashRes;
  try {
    const idToken = await bkashGrantToken(bkashConfig, env);
    bkashRes = await bkashCreatePayment(bkashConfig, idToken, {
      amount,
      merchantInvoiceNumber: tranId,
      callbackURL:           `${base}/api/payment-callback`,
      payerReference:        reg.guardian_phone || reg.guardian_email,
    });
  } catch (err) {
    return badRequest(err.message || "Payment gateway error. Please try again.");
  }

  const paymentId = createId("pay");
  await env.DB.prepare(
    "INSERT INTO payments (id, registration_id, amount, currency, tran_id, coupon_code, status, created_at, updated_at) VALUES (?, ?, ?, 'BDT', ?, ?, 'pending', ?, ?)"
  ).bind(paymentId, registrationId, amount, bkashRes.paymentID, couponCode || null, now, now).run();

  return jsonResponse({ ok: true, bkashURL: bkashRes.bkashURL });
}

export async function handlePaymentCallback(request, env, url) {
  const base      = getBaseUrl(request);
  const paymentID = url.searchParams.get("paymentID");
  const status    = url.searchParams.get("status");

  if (status === "cancel")           return redirectTo(`${base}/dashboard.html?payment=cancelled`);
  if (status === "failure" || !paymentID) return redirectTo(`${base}/dashboard.html?payment=failed`);

  // Reject callbacks for unknown or already-processed paymentIDs
  const pendingPayment = await env.DB.prepare(
    "SELECT id, coupon_code FROM payments WHERE tran_id = ? AND status = 'pending' LIMIT 1"
  ).bind(paymentID).first();
  if (!pendingPayment) return redirectTo(`${base}/dashboard.html?payment=failed`);

  try {
    const config  = getBkashConfig(env);
    const idToken = await bkashGrantToken(config, env);
    const result  = await bkashExecutePayment(config, idToken, paymentID);
    const now     = new Date().toISOString();

    if (result.transactionStatus !== "Completed") {
      await env.DB.prepare(
        "UPDATE payments SET status = 'failed', gateway_status = ?, updated_at = ? WHERE tran_id = ?"
      ).bind(result.transactionStatus || "FAILED", now, paymentID).run();
      return redirectTo(`${base}/dashboard.html?payment=failed`);
    }

    const batchOps = [
      env.DB.prepare(
        "UPDATE payments SET status = 'paid', gateway_status = 'Completed', val_id = ?, updated_at = ? WHERE tran_id = ?"
      ).bind(result.trxID, now, paymentID),
      env.DB.prepare(`
        UPDATE registrations SET status = 'paid'
        WHERE id = (SELECT registration_id FROM payments WHERE tran_id = ? LIMIT 1)
      `).bind(paymentID),
    ];
    if (pendingPayment.coupon_code) {
      batchOps.push(
        env.DB.prepare("UPDATE coupons SET used_count = used_count + 1 WHERE code = ?")
          .bind(pendingPayment.coupon_code)
      );
    }
    await env.DB.batch(batchOps);

    try { await assignMemberIdAndSendReceipt(env, paymentID); } catch (err) {
      console.log("[payment-callback] receipt error:", err.message);
    }

    return redirectTo(`${base}/dashboard.html?payment=success`);
  } catch (err) {
    console.log("[payment-callback] bKash error:", err.message);
    return redirectTo(`${base}/dashboard.html?payment=failed`);
  }
}

export async function handleAddEnrollment(request, env) {
  let account;
  try { account = await requireAuth(request, env); }
  catch (e) { return badRequest(e.message, e.status || 401); }

  const payload          = await parseJson(request);
  const registrationType = normalizeString(payload.registrationType) || "national-qualifying-round";
  if (!Object.prototype.hasOwnProperty.call(PROGRAM_PRICES, registrationType)) {
    return badRequest("Invalid registration type.");
  }

  const existing = await env.DB.prepare(
    "SELECT * FROM registrations WHERE guardian_account_id = ? ORDER BY created_at DESC LIMIT 1"
  ).bind(account.account_id).first();
  if (!existing) return badRequest("No existing registration found. Please complete a full registration first.", 404);

  const duplicate = await env.DB.prepare(
    "SELECT id FROM registrations WHERE guardian_account_id = ? AND registration_type = ? AND status != 'cancelled' LIMIT 1"
  ).bind(account.account_id, registrationType).first();
  if (duplicate) return badRequest("Your child is already enrolled in this program.", 409);

  // Olympiad and Quiz are mutually exclusive — only one competition per student.
  const COMPETITIONS = ["national-qualifying-round", "national-quiz-competition"];
  if (COMPETITIONS.includes(registrationType)) {
    const otherType = COMPETITIONS.find(t => t !== registrationType);
    const otherComp = await env.DB.prepare(
      "SELECT id FROM registrations WHERE guardian_account_id = ? AND registration_type = ? AND status != 'cancelled' LIMIT 1"
    ).bind(account.account_id, otherType).first();
    if (otherComp) return badRequest("Each student may register for either the BdMSO National Round or the BdMSO Quiz Competition, not both.", 409);
  }

  const applicationId = createId("app");
  const createdAt     = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO registrations (
      id, registration_type, student_full_name, student_date_of_birth, student_class_name,
      student_gender, student_medium, student_school, student_district, guardian_account_id, guardian_full_name,
      guardian_relationship, guardian_phone, guardian_email, guardian_address,
      terms_accepted, status, source_page, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'submitted', 'programs.html', ?)
  `).bind(
    applicationId, registrationType,
    existing.student_full_name, existing.student_date_of_birth,
    existing.student_class_name, existing.student_gender,
    existing.student_medium || null,
    existing.student_school, existing.student_district,
    account.account_id, existing.guardian_full_name,
    existing.guardian_relationship, existing.guardian_phone,
    account.email, existing.guardian_address,
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
