// ─── Utilities ────────────────────────────────────────────────────────────────

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function badRequest(message, status = 400) {
  return jsonResponse({ error: message }, status);
}

function redirectTo(url) {
  return Response.redirect(url, 302);
}

function normalizeString(value) {
  return String(value ?? "").trim();
}

function requireField(value, label) {
  const v = normalizeString(value);
  if (!v) throw new Error(`${label} is required.`);
  return v;
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isPhoneLike(value) {
  return normalizeString(value).replace(/[^\d+]/g, "").length >= 8;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

async function reserveMemberId(env, year) {
  const result = await env.DB.prepare(
    "INSERT INTO member_id_seq (reserved_at) VALUES (?)"
  ).bind(new Date().toISOString()).run();
  const seq = result.meta?.last_row_id ?? 0;
  const yy = String(year).slice(-2);
  return `${yy}-${String(seq).padStart(5, "0")}`;
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

const PBKDF2_ITERATIONS_CURRENT = 600000;
const DUMMY_HASH_SALT = "timing-normaliser-not-a-real-account-salt";

async function hashPassword(password, salt, iterations = PBKDF2_ITERATIONS_CURRENT) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations, hash: "SHA-256" },
    key, 256
  );
  return toHex(bits);
}

async function parseJson(request) {
  try { return await request.json(); }
  catch { throw new Error("Request body must be valid JSON."); }
}

async function parseForm(request) {
  try { return Object.fromEntries(new URLSearchParams(await request.text())); }
  catch { return {}; }
}

function getBaseUrl(request) {
  const u = new URL(request.url);
  return `${u.protocol}//${u.host}`;
}

// ─── Session Management ────────────────────────────────────────────────────────

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

async function createSession(env, accountId) {
  const token = crypto.randomUUID() + "-" + crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await env.DB.prepare(
    "INSERT INTO sessions (id, account_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
  ).bind(token, accountId, expiresAt, new Date().toISOString()).run();
  return token;
}

async function verifySession(env, token) {
  if (!token) return null;
  const row = await env.DB.prepare(`
    SELECT s.account_id, a.email, a.full_name
    FROM sessions s
    JOIN guardian_accounts a ON a.id = s.account_id
    WHERE s.id = ? AND s.expires_at > ?
    LIMIT 1
  `).bind(token, new Date().toISOString()).first();
  return row || null;
}

function extractToken(request) {
  const auth = request.headers.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : null;
}

async function requireAuth(request, env) {
  const account = await verifySession(env, extractToken(request));
  if (!account) throw Object.assign(new Error("Unauthorised."), { status: 401 });
  return account;
}

// ─── Rate Limiting ────────────────────────────────────────────────────────────

const LOGIN_WINDOW_MS  = 15 * 60 * 1000;
const LOGIN_MAX_FAILS  = 5;

async function checkLoginRateLimit(env, email) {
  const since = new Date(Date.now() - LOGIN_WINDOW_MS).toISOString();
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM login_attempts WHERE email = ? AND success = 0 AND attempted_at > ?"
  ).bind(email, since).first();
  return (row?.n || 0) < LOGIN_MAX_FAILS;
}

async function recordLoginAttempt(env, email, success) {
  await env.DB.prepare(
    "INSERT INTO login_attempts (email, success, attempted_at) VALUES (?, ?, ?)"
  ).bind(email, success ? 1 : 0, new Date().toISOString()).run();
}

// ─── Email Verification ───────────────────────────────────────────────────────

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

async function createVerificationToken(env, accountId) {
  const token     = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS).toISOString();
  const createdAt = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO email_verification_tokens (token, account_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
  ).bind(token, accountId, expiresAt, createdAt).run();
  return token;
}

function parseEmailFrom(raw) {
  // Accepts "Name <email@x.com>" or plain "email@x.com".
  const str = normalizeString(raw) || "BdMSO <no-reply@bdmso.org>";
  const match = str.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1] || "BdMSO", email: match[2] };
  return { name: "BdMSO", email: str };
}

async function sendReceiptEmail(env, reg, memberId) {
  const programName = PROGRAM_NAMES[reg.registration_type] || reg.registration_type;
  const paidAt = new Date(reg.paid_at || Date.now()).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric"
  });
  const amountFormatted = `৳ ${Number(reg.amount).toLocaleString("en-BD")}`;

  console.log(`[email-receipt] ${reg.guardian_email} → member ${memberId}`);
  if (!env.BREVO_API_KEY) return;

  const sender = parseEmailFrom(env.EMAIL_FROM);
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#0b1b3f;">
      <div style="background:#0b1b3f;padding:28px 32px;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;color:#fcd34d;font-size:22px;letter-spacing:1px;">BdMSO</h1>
        <p style="margin:6px 0 0;color:rgba(255,255,255,0.7);font-size:13px;">Bangladesh Mathematical Science Olympiad</p>
      </div>
      <div style="background:#fffbeb;border:1px solid #fcd34d;padding:20px 32px;display:flex;align-items:center;gap:16px;">
        <div>
          <div style="font-size:10px;font-weight:700;letter-spacing:0.15em;color:#b45309;text-transform:uppercase;">Member ID</div>
          <div style="font-size:22px;font-weight:700;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:1.5px;color:#0b1b3f;">${escapeHtml(memberId)}</div>
        </div>
      </div>
      <div style="background:white;border:1px solid #e5e7eb;border-top:none;padding:28px 32px;">
        <h2 style="margin:0 0 4px;font-size:18px;">Payment Receipt</h2>
        <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">${escapeHtml(programName)}</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr style="border-bottom:1px solid #f3f4f6;">
            <td style="padding:10px 0;color:#6b7280;">Student</td>
            <td style="padding:10px 0;font-weight:600;text-align:right;">${escapeHtml(reg.student_full_name)}</td>
          </tr>
          <tr style="border-bottom:1px solid #f3f4f6;">
            <td style="padding:10px 0;color:#6b7280;">Class</td>
            <td style="padding:10px 0;font-weight:600;text-align:right;">${escapeHtml(reg.student_class_name)}</td>
          </tr>
          <tr style="border-bottom:1px solid #f3f4f6;">
            <td style="padding:10px 0;color:#6b7280;">School</td>
            <td style="padding:10px 0;font-weight:600;text-align:right;">${escapeHtml(reg.student_school)}</td>
          </tr>
          <tr style="border-bottom:1px solid #f3f4f6;">
            <td style="padding:10px 0;color:#6b7280;">Guardian</td>
            <td style="padding:10px 0;font-weight:600;text-align:right;">${escapeHtml(reg.guardian_full_name)}</td>
          </tr>
          <tr style="border-bottom:1px solid #f3f4f6;">
            <td style="padding:10px 0;color:#6b7280;">Transaction ID</td>
            <td style="padding:10px 0;font-weight:600;text-align:right;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;">${escapeHtml(reg.tran_id)}</td>
          </tr>
          <tr style="border-bottom:1px solid #f3f4f6;">
            <td style="padding:10px 0;color:#6b7280;">Payment Date</td>
            <td style="padding:10px 0;font-weight:600;text-align:right;">${paidAt}</td>
          </tr>
          <tr>
            <td style="padding:14px 0;font-size:16px;font-weight:700;">Amount Paid</td>
            <td style="padding:14px 0;font-size:18px;font-weight:700;text-align:right;color:#15803d;">${amountFormatted}</td>
          </tr>
        </table>
      </div>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;padding:16px 32px;border-radius:0 0 12px 12px;">
        <p style="margin:0;color:#9ca3af;font-size:12px;">This is an official payment confirmation from BdMSO. Please retain this for your records.</p>
      </div>
    </div>`;

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": env.BREVO_API_KEY,
        "content-type": "application/json",
        "accept": "application/json",
      },
      body: JSON.stringify({
        sender,
        to: [{ email: reg.guardian_email, name: reg.guardian_full_name }],
        subject: `Payment Confirmed — ${programName} (${memberId})`,
        htmlContent: html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.log(`[email-receipt] brevo error ${res.status}: ${body}`);
    }
  } catch (err) {
    console.log("[email-receipt] brevo fetch failed:", err.message);
  }
}

async function assignMemberIdAndSendReceipt(env, tranId) {
  const row = await env.DB.prepare(`
    SELECT r.id, r.member_id, r.guardian_account_id, r.registration_type, r.student_full_name,
           r.student_class_name, r.student_school, r.student_district, r.guardian_full_name,
           r.guardian_email, p.amount, p.tran_id, p.updated_at AS paid_at
    FROM registrations r
    JOIN payments p ON p.registration_id = r.id
    WHERE p.tran_id = ? LIMIT 1
  `).bind(tranId).first();

  if (!row || row.member_id) return;

  // Reuse the member ID already issued to this guardian, otherwise mint a new one.
  let memberId = null;
  if (row.guardian_account_id) {
    const existing = await env.DB.prepare(
      "SELECT member_id FROM registrations WHERE guardian_account_id = ? AND member_id IS NOT NULL LIMIT 1"
    ).bind(row.guardian_account_id).first();
    memberId = existing?.member_id || null;
  }
  if (!memberId) {
    memberId = await reserveMemberId(env, new Date().getUTCFullYear());
  }

  const result = await env.DB.prepare(
    "UPDATE registrations SET member_id = ? WHERE id = ? AND member_id IS NULL"
  ).bind(memberId, row.id).run();

  if (result.meta?.changes > 0) {
    await sendReceiptEmail(env, { ...row, tran_id: tranId }, memberId);
  }
}

async function sendVerificationEmail(env, email, verifyUrl) {
  // Always log so you can grab the link from `wrangler dev` output in local development.
  console.log(`[email-verify] ${email} → ${verifyUrl}`);
  if (!env.BREVO_API_KEY) return;

  const sender = parseEmailFrom(env.EMAIL_FROM);
  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 520px; margin: 0 auto;">
      <h2 style="color: #0b1b3f;">Welcome to BdMSO!</h2>
      <p>Thanks for registering. Please verify your email address by clicking the button below:</p>
      <p style="margin: 24px 0;">
        <a href="${verifyUrl}" style="background: #0b1b3f; color: white; padding: 12px 24px; border-radius: 10px; text-decoration: none; display: inline-block; font-weight: 600;">Verify my email</a>
      </p>
      <p style="color: #666; font-size: 13px;">Or copy this link into your browser:<br><span style="word-break: break-all;">${verifyUrl}</span></p>
      <p style="color: #999; font-size: 12px; margin-top: 32px;">This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.</p>
    </div>`;

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": env.BREVO_API_KEY,
        "content-type": "application/json",
        "accept": "application/json",
      },
      body: JSON.stringify({
        sender,
        to: [{ email }],
        subject: "Verify your BdMSO account",
        htmlContent: html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.log(`[email-verify] brevo error ${res.status}: ${body}`);
    }
  } catch (err) {
    console.log("[email-verify] brevo fetch failed:", err.message);
  }
}

// ─── Program Names ───────────────────────────────────────────────────────────

const PROGRAM_NAMES = {
  "national-qualifying-round": "National Qualifying Round",
  "national-qualifying-round-both": "National Qualifying Round (Math + Science)",
  "stem-foundation":           "STEM Foundation Program",
  "bdmso-preparatory":         "BdMSO Preparatory Course",
  "stem-masterclass":          "STEM Masterclass Series",
  "mock-test":                 "Mock Test Program",
  "lab-day":                   "Lab Day Workshop",
  "robotics-foundation":       "Robotics Foundation Course",
  "summer-camp":               "SPSB Nature Camp",
  "winter-camp":               "International Summer/Winter Camp",
  "exchange-program":          "BdMSO Exchange Program",
};

// ─── SSLCommerz ───────────────────────────────────────────────────────────────

// Pricing map: registration_type slug → BDT amount
const PROGRAM_PRICES = {
  "national-qualifying-round":      1000,
  "national-qualifying-round-both": 1500,
  "stem-foundation":                8000,
  "bdmso-preparatory":              12000,
  "stem-masterclass":               6000,
  "mock-test":                      3000,
  "lab-day":                        2000,
  "robotics-foundation":            7000,
  "summer-camp":                    15000,
  "winter-camp":                    25000,
  "exchange-program":               50000,
};

function getSslConfig(env) {
  const sandbox = (env.SSLCOMMERZ_SANDBOX ?? "true") !== "false";
  return {
    storeId:     env.SSLCOMMERZ_STORE_ID     || "testbox",
    storePasswd: env.SSLCOMMERZ_STORE_PASSWD || "qwerty",
    initUrl: sandbox
      ? "https://sandbox.sslcommerz.com/gwprocess/v4/api.php"
      : "https://securepay.sslcommerz.com/gwprocess/v4/api.php",
    validateUrl: sandbox
      ? "https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php"
      : "https://securepay.sslcommerz.com/validator/api/validationserverAPI.php",
  };
}

async function initSslPayment(env, params) {
  const { storeId, storePasswd, initUrl } = getSslConfig(env);
  const body = new URLSearchParams({ store_id: storeId, store_passwd: storePasswd, ...params });
  const res = await fetch(initUrl, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  });
  return res.json();
}

async function validateSslPayment(env, valId) {
  const { storeId, storePasswd, validateUrl } = getSslConfig(env);
  const url = `${validateUrl}?val_id=${encodeURIComponent(valId)}&store_id=${encodeURIComponent(storeId)}&store_passwd=${encodeURIComponent(storePasswd)}&format=json`;
  const res = await fetch(url);
  return res.json();
}

// ─── Route Handlers ───────────────────────────────────────────────────────────

async function handleLogin(request, env) {
  const payload = await parseJson(request);
  const email    = requireField(payload.email,    "Email").toLowerCase();
  const password = requireField(payload.password, "Password");

  if (!(await checkLoginRateLimit(env, email))) {
    return badRequest("Too many failed attempts. Please try again in 15 minutes.", 429);
  }

  const account = await env.DB.prepare(
    "SELECT id, email, full_name, password_hash, password_salt, password_iterations, email_verified FROM guardian_accounts WHERE email = ? LIMIT 1"
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
    emailVerified: !!account.email_verified
  });
}

async function handleLogout(request, env) {
  const token = extractToken(request);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(token).run();
  return jsonResponse({ ok: true });
}

async function handleMe(request, env) {
  let account;
  try { account = await requireAuth(request, env); }
  catch (e) { return badRequest(e.message, e.status || 401); }

  const verified = await env.DB.prepare(
    "SELECT email_verified FROM guardian_accounts WHERE id = ? LIMIT 1"
  ).bind(account.account_id).first();

  const rows = await env.DB.prepare(`
    SELECT r.id, r.member_id, r.registration_type, r.student_full_name, r.student_class_name,
           r.student_gender, r.student_school, r.student_district, r.status, r.created_at,
           p.id    AS payment_id,
           p.status AS payment_status,
           p.amount AS payment_amount,
           p.tran_id,
           p.updated_at AS payment_date
    FROM registrations r
    LEFT JOIN payments p ON p.id = (
      SELECT id FROM payments WHERE registration_id = r.id ORDER BY created_at DESC LIMIT 1
    )
    WHERE r.guardian_account_id = ?
    ORDER BY r.created_at DESC
  `).bind(account.account_id).all();

  return jsonResponse({
    ok: true,
    account: {
      fullName: account.full_name,
      email: account.email,
      emailVerified: !!verified?.email_verified
    },
    registrations: rows.results
  });
}

async function handleRegistration(request, env) {
  const payload  = await parseJson(request);
  const student  = payload.student  || {};
  const guardian = payload.guardian || {};
  const acct     = payload.account  || {};

  const studentFullName    = requireField(student.fullName,   "Student full name");
  const studentDateOfBirth = requireField(student.dateOfBirth,"Date of birth");
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
  const sourcePage         = normalizeString(payload.sourcePage);
  const termsAccepted      = Boolean(payload.termsAccepted);

  if (!termsAccepted) return badRequest("Rules and regulations must be accepted.");
  if (!isEmail(guardianEmail)) return badRequest("Guardian email is not valid.");
  if (!isPhoneLike(guardianPhone)) return badRequest("Guardian phone number is not valid.");
  if (password.length < 8) return badRequest("Password must be at least 8 characters long.");

  const existing = await env.DB.prepare(
    "SELECT id FROM guardian_accounts WHERE email = ? LIMIT 1"
  ).bind(guardianEmail).first();
  // Same generic error whether email exists or not — prevents enumeration.
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
        student_gender, student_school, student_district, guardian_account_id, guardian_full_name,
        guardian_relationship, guardian_phone, guardian_email, guardian_address,
        terms_accepted, status, source_page, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      applicationId, registrationType, studentFullName, studentDateOfBirth, studentClassName,
      studentGender, studentSchool, studentDistrict, guardianAccountId, guardianFullName,
      guardianRelationship, guardianPhone, guardianEmail, guardianAddress,
      termsAccepted ? 1 : 0, "submitted", sourcePage, createdAt
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

async function handleVerifyEmail(request, env, url) {
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

async function handleResendVerification(request, env) {
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

async function handleSponsorship(request, env) {
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

  return jsonResponse({ ok: true, leadId });
}

async function handleCreatePayment(request, env) {
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
        (!coupon.applies_to || coupon.applies_to.split(",").map(s => s.trim()).includes(reg.registration_type))
    ) {
      finalAmount = coupon.discount_type === "percent"
        ? Math.round(baseAmount * (1 - coupon.discount_value / 100))
        : Math.max(0, baseAmount - coupon.discount_value);
      await env.DB.prepare("UPDATE coupons SET used_count = used_count + 1 WHERE code = ?").bind(couponCode).run();
    }
  }

  const amount = finalAmount;
  const tranId = createId("txn");
  const now    = new Date().toISOString();
  const base   = getBaseUrl(request);

  // Free registration — skip payment gateway entirely
  if (amount === 0) {
    const paymentId = createId("pay");
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO payments (id, registration_id, account_id, amount, currency, tran_id, status, created_at, updated_at) VALUES (?, ?, ?, 0, 'BDT', ?, 'paid', ?, ?)"
      ).bind(paymentId, registrationId, account.account_id, tranId, now, now),
      env.DB.prepare("UPDATE registrations SET status = 'paid' WHERE id = ?").bind(registrationId),
    ]);
    try { await assignMemberIdAndSendReceipt(env, tranId); } catch {}
    return jsonResponse({ ok: true, free: true });
  }

  const sslRes = await initSslPayment(env, {
    total_amount:     String(amount),
    currency:         "BDT",
    tran_id:          tranId,
    success_url:      `${base}/api/payment-callback?type=success`,
    fail_url:         `${base}/api/payment-callback?type=fail`,
    cancel_url:       `${base}/api/payment-callback?type=cancel`,
    ipn_url:          `${base}/api/payment-ipn`,
    product_name:     reg.registration_type,
    product_category: "Olympiad Registration",
    product_profile:  "general",
    cus_name:         reg.guardian_full_name,
    cus_email:        reg.guardian_email,
    cus_add1:         reg.guardian_address,
    cus_city:         reg.student_district,
    cus_country:      "Bangladesh",
    cus_phone:        reg.guardian_phone,
    shipping_method:  "NO",
  });

  if (!sslRes?.GatewayPageURL) {
    return badRequest(sslRes?.failedreason || "Payment gateway error. Please try again.");
  }

  const paymentId = createId("pay");
  await env.DB.prepare(
    "INSERT INTO payments (id, registration_id, account_id, amount, currency, tran_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'BDT', ?, 'pending', ?, ?)"
  ).bind(paymentId, registrationId, account.account_id, amount, tranId, now, now).run();

  return jsonResponse({ ok: true, gatewayUrl: sslRes.GatewayPageURL });
}

async function handlePaymentCallback(request, env, url) {
  const type = url.searchParams.get("type") || "fail";
  const base = getBaseUrl(request);
  const data = request.method === "POST"
    ? await parseForm(request)
    : Object.fromEntries(url.searchParams);

  if (type === "cancel") return redirectTo(`${base}/dashboard.html?payment=cancelled`);
  if (type === "fail")   return redirectTo(`${base}/dashboard.html?payment=failed`);

  const { val_id: valId, tran_id: tranId } = data;
  if (!valId || !tranId) return redirectTo(`${base}/dashboard.html?payment=failed`);

  try {
    const validation = await validateSslPayment(env, valId);
    const now = new Date().toISOString();

    if (validation.status !== "VALID" && validation.status !== "VALIDATED") {
      await env.DB.prepare(
        "UPDATE payments SET status = 'failed', gateway_status = ?, val_id = ?, updated_at = ? WHERE tran_id = ?"
      ).bind(validation.status || "INVALID", valId, now, tranId).run();
      return redirectTo(`${base}/dashboard.html?payment=failed`);
    }

    await env.DB.batch([
      env.DB.prepare(
        "UPDATE payments SET status = 'paid', gateway_status = 'VALID', val_id = ?, updated_at = ? WHERE tran_id = ?"
      ).bind(valId, now, tranId),
      env.DB.prepare(`
        UPDATE registrations SET status = 'paid'
        WHERE id = (SELECT registration_id FROM payments WHERE tran_id = ? LIMIT 1)
      `).bind(tranId)
    ]);

    try { await assignMemberIdAndSendReceipt(env, tranId); } catch (err) {
      console.log("[payment-callback] receipt error:", err.message);
    }

    return redirectTo(`${base}/dashboard.html?payment=success`);
  } catch {
    return redirectTo(`${base}/dashboard.html?payment=failed`);
  }
}

async function handlePaymentIpn(request, env) {
  const data = await parseForm(request);
  const { val_id: valId, tran_id: tranId } = data;
  if (!valId || !tranId) return jsonResponse({ ok: false });

  try {
    const validation = await validateSslPayment(env, valId);
    if (validation.status === "VALID" || validation.status === "VALIDATED") {
      const now = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE payments SET status = 'paid', gateway_status = 'VALID', val_id = ?, updated_at = ? WHERE tran_id = ?"
        ).bind(valId, now, tranId),
        env.DB.prepare(`
          UPDATE registrations SET status = 'paid'
          WHERE id = (SELECT registration_id FROM payments WHERE tran_id = ? LIMIT 1)
        `).bind(tranId)
      ]);
      try { await assignMemberIdAndSendReceipt(env, tranId); } catch (err) {
        console.log("[payment-ipn] receipt error:", err.message);
      }
    }
  } catch {}

  return jsonResponse({ ok: true });
}

async function handleAddEnrollment(request, env) {
  let account;
  try { account = await requireAuth(request, env); }
  catch (e) { return badRequest(e.message, e.status || 401); }

  const payload          = await parseJson(request);
  const registrationType = normalizeString(payload.registrationType) || "national-qualifying-round";

  const existing = await env.DB.prepare(
    "SELECT * FROM registrations WHERE guardian_account_id = ? ORDER BY created_at DESC LIMIT 1"
  ).bind(account.account_id).first();
  if (!existing) return badRequest("No existing registration found. Please complete a full registration first.", 404);

  const duplicate = await env.DB.prepare(
    "SELECT id FROM registrations WHERE guardian_account_id = ? AND registration_type = ? AND status != 'cancelled' LIMIT 1"
  ).bind(account.account_id, registrationType).first();
  if (duplicate) return badRequest("Your child is already enrolled in this program.", 409);

  const applicationId = createId("app");
  const createdAt     = new Date().toISOString();

  // Reuse the guardian's existing member ID so it's the same across every program.
  const existingMember = await env.DB.prepare(
    "SELECT member_id FROM registrations WHERE guardian_account_id = ? AND member_id IS NOT NULL LIMIT 1"
  ).bind(account.account_id).first();
  const memberId = existingMember?.member_id || null;

  await env.DB.prepare(`
    INSERT INTO registrations (
      id, registration_type, student_full_name, student_date_of_birth, student_class_name,
      student_gender, student_school, student_district, guardian_account_id, guardian_full_name,
      guardian_relationship, guardian_phone, guardian_email, guardian_address,
      member_id, terms_accepted, status, source_page, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'submitted', 'programs.html', ?)
  `).bind(
    applicationId, registrationType,
    existing.student_full_name, existing.student_date_of_birth,
    existing.student_class_name, existing.student_gender,
    existing.student_school, existing.student_district,
    account.account_id, existing.guardian_full_name,
    existing.guardian_relationship, existing.guardian_phone,
    account.email, existing.guardian_address,
    memberId, createdAt
  ).run();

  return jsonResponse({ ok: true, applicationId });
}

async function handleValidateCoupon(request, env, url) {
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
    const allowed = coupon.applies_to.split(",").map(s => s.trim());
    if (!allowed.includes(type)) return badRequest("This coupon is not valid for this program.", 422);
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

// ─── Router ───────────────────────────────────────────────────────────────────

async function handleApi(request, env, url) {
  const { pathname } = url;
  const method = request.method;

  try {
    if (pathname === "/api/login"                  && method === "POST") return await handleLogin(request, env);
    if (pathname === "/api/logout"                 && method === "POST") return await handleLogout(request, env);
    if (pathname === "/api/me"                     && method === "GET")  return await handleMe(request, env);
    if (pathname === "/api/submit-registration"    && method === "POST") return await handleRegistration(request, env);
    if (pathname === "/api/add-enrollment"         && method === "POST") return await handleAddEnrollment(request, env);
    if (pathname === "/api/validate-coupon"        && method === "GET")  return await handleValidateCoupon(request, env, url);
    if (pathname === "/api/submit-sponsorship"     && method === "POST") return await handleSponsorship(request, env);
    if (pathname === "/api/create-payment"         && method === "POST") return await handleCreatePayment(request, env);
    if (pathname === "/api/payment-callback")                            return await handlePaymentCallback(request, env, url);
    if (pathname === "/api/payment-ipn"            && method === "POST") return await handlePaymentIpn(request, env);
    if (pathname === "/api/verify-email"           && method === "GET")  return await handleVerifyEmail(request, env, url);
    if (pathname === "/api/resend-verification"    && method === "POST") return await handleResendVerification(request, env);

    return badRequest("Not found.", 404);
  } catch (error) {
    if (error.status) return badRequest(error.message, error.status);
    return badRequest(error.message || "The request could not be completed.");
  }
}

// ─── Security Headers ─────────────────────────────────────────────────────────

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

function withSecurityHeaders(response, url) {
  // ASSETS.fetch() returns an immutable response — clone to mutate headers.
  const res = new Response(response.body, response);
  // HSTS only on real domains — localhost would get stuck refusing http:// in future dev sessions.
  if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.headers.set("Content-Security-Policy", CSP);
  return res;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const response = url.pathname.startsWith("/api/")
      ? await handleApi(request, env, url)
      : await env.ASSETS.fetch(request);
    return withSecurityHeaders(response, url);
  }
};
