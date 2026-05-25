// Email verification tokens + transactional emails (receipts, sponsorship
// notifications, verification links) via Brevo (formerly Sendinblue).

import { normalizeString, escapeHtml } from "./validation.js";
import { reserveMemberId, parseClassDigit } from "./util.js";
import { PROGRAM_NAMES } from "./programs.js";
import { getOptionLabels, programHasOptions } from "./program-options.js";

// Cloudflare Workers retains console output. Emails and URL tokens are
// PII; redact before logging. logEmail keeps the domain (useful for
// debugging deliverability) but drops the local-part beyond two chars.
// logToken keeps the first 8 chars so we can correlate with DB rows
// without exposing a working credential.
export function maskEmailForLog(email) {
  if (!email || typeof email !== "string") return "(none)";
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const user = email.slice(0, at);
  const domain = email.slice(at);
  const head = user.slice(0, 2);
  return `${head}***${domain}`;
}
export function maskTokenForLog(token) {
  if (!token || typeof token !== "string") return "(none)";
  return token.length <= 8 ? "***" : `${token.slice(0, 8)}…`;
}

// Tightened dev-mode gate. The previous heuristic ("sandbox truthy OR
// missing PROD") could leak verification/reset tokens into production
// logs if SHURJOPAY_SANDBOX got toggled on by accident. ENVIRONMENT is
// an explicit binding set in .dev.vars / wrangler.prod.toml.
function isDev(env) {
  return env.ENVIRONMENT === "development";
}

export const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

export async function createVerificationToken(env, accountId) {
  const token     = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS).toISOString();
  const createdAt = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO email_verification_tokens (token, account_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
  ).bind(token, accountId, expiresAt, createdAt).run();
  return token;
}

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;  // 1 hour

export async function createPasswordResetToken(env, accountId) {
  const token     = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS).toISOString();
  const createdAt = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO password_reset_tokens (token, account_id, expires_at, used, created_at) VALUES (?, ?, ?, 0, ?)"
  ).bind(token, accountId, expiresAt, createdAt).run();
  return token;
}

export function parseEmailFrom(raw) {
  // Accepts "Name <email@x.com>" or plain "email@x.com".
  const str = normalizeString(raw) || "BdMSO <no-reply@bdmso.org>";
  const match = str.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1] || "BdMSO", email: match[2] };
  return { name: "BdMSO", email: str };
}

// `extras` accepts:
//   kind             'initial' (default) or 'updated' (issued after a
//                    guardian option change - banner + subject reflect that)
//   optionLabels     array of human-readable option names (e.g.
//                    ["Mathematics"], ["Mock Test 1 - Math", "Mock Test 2 - Math"]).
//                    Omitted for programs without options.
//   cumulativeAmount on 'updated' receipts, the total the guardian has paid
//                    across all payments for this registration. Initial
//                    receipts ignore it and use reg.amount as today.
export async function sendReceiptEmail(env, reg, memberId, baseUrl, extras = {}) {
  const { kind = "initial", optionLabels = [], cumulativeAmount = null } = extras;
  const isUpdated = kind === "updated";

  const programName = PROGRAM_NAMES[reg.registration_type] || reg.registration_type;
  // Absolute logo URL - emails can't use relative paths. Falls back to
  // the canonical domain if the caller didn't pass a request base.
  const logoBase = baseUrl || "https://bdmso.org";
  const paidAt = new Date(reg.paid_at || Date.now()).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric"
  });
  const totalAmount = isUpdated && cumulativeAmount != null ? cumulativeAmount : reg.amount;
  const amountFormatted = `৳ ${Number(totalAmount).toLocaleString("en-BD")}`;
  const amountLabel = isUpdated ? "Total Paid" : "Amount Paid";

  console.log(`[email-receipt] ${maskEmailForLog(reg.guardian_email)} → member ${memberId} (${kind})`);
  if (!env.BREVO_API_KEY) return;

  const sender = parseEmailFrom(env.EMAIL_FROM);
  const updatedBanner = isUpdated ? `
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-bottom:none;padding:14px 32px;color:#1e3a8a;font-size:13px;line-height:1.55;">
        <strong>Updated receipt.</strong> You changed your selection for this registration; this receipt supersedes the one issued previously.
      </div>` : "";
  const selectionRow = optionLabels.length ? `
          <tr style="border-bottom:1px solid #f3f4f6;">
            <td style="padding:10px 0;color:#6b7280;vertical-align:top;">Selection</td>
            <td style="padding:10px 0;font-weight:600;text-align:right;">${optionLabels.map(escapeHtml).join("<br>")}</td>
          </tr>` : "";
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#0b1b3f;">
      <div style="background:#0b1b3f;padding:24px 32px;border-radius:12px 12px 0 0;text-align:center;">
        <div style="display:inline-block;background:#ffffff;border-radius:9px;padding:9px 14px;">
          <img src="${logoBase}/images/logo.webp" alt="BdMSO" width="150" style="display:block;border:0;">
        </div>
        <p style="margin:12px 0 0;color:rgba(255,255,255,0.7);font-size:13px;">Bangladesh Mathematics &amp; Science Olympiad</p>
      </div>${updatedBanner}
      <div style="background:#fffbeb;border:1px solid #fcd34d;padding:20px 32px;display:flex;align-items:center;gap:16px;">
        <div>
          <div style="font-size:10px;font-weight:700;letter-spacing:0.15em;color:#b45309;text-transform:uppercase;">BdMSO ID</div>
          <div style="font-size:22px;font-weight:700;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:1.5px;color:#0b1b3f;">${escapeHtml(memberId)}</div>
        </div>
      </div>
      <div style="background:white;border:1px solid #e5e7eb;border-top:none;padding:28px 32px;">
        <h2 style="margin:0 0 4px;font-size:18px;">${isUpdated ? "Updated Receipt" : "Payment Receipt"}</h2>
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
          </tr>${selectionRow}
          <tr style="border-bottom:1px solid #f3f4f6;">
            <td style="padding:10px 0;color:#6b7280;">Transaction ID</td>
            <td style="padding:10px 0;font-weight:600;text-align:right;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;">${escapeHtml(reg.tran_id)}</td>
          </tr>
          <tr style="border-bottom:1px solid #f3f4f6;">
            <td style="padding:10px 0;color:#6b7280;">${isUpdated ? "Updated On" : "Payment Date"}</td>
            <td style="padding:10px 0;font-weight:600;text-align:right;">${paidAt}</td>
          </tr>
          <tr>
            <td style="padding:14px 0;font-size:16px;font-weight:700;">${amountLabel}</td>
            <td style="padding:14px 0;font-size:18px;font-weight:700;text-align:right;color:#15803d;">${amountFormatted}</td>
          </tr>
        </table>
      </div>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;padding:16px 32px;border-radius:0 0 12px 12px;">
        <p style="margin:0 0 8px;color:#6b7280;font-size:12px;line-height:1.55;">This is an electronic receipt for your BdMSO registration. Please retain it for your records; you may be asked to show it on program day. For any questions or corrections, email <strong style="color:#374151;">support@bdmso.org</strong> and quote your BdMSO ID.</p>
        <p style="margin:0;color:#9ca3af;font-size:12px;"><strong style="color:#374151;">Refund policy:</strong> Any transaction made through the BdMSO website is non-refundable.</p>
      </div>
    </div>`;

  const subject = isUpdated
    ? `Updated Receipt - ${programName} (${memberId})`
    : `Payment Confirmed - ${programName} (${memberId})`;

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
        subject,
        htmlContent: html,
      }),
    });
    const body = await res.text().catch(() => "");
    if (!res.ok) {
      console.log(`[email-receipt] brevo error ${res.status}: ${body}`);
    } else {
      let parsed = {};
      try { parsed = JSON.parse(body); } catch {}
      console.log(`[email-receipt] brevo accepted: messageId=${parsed.messageId || "(none)"}`);
    }
  } catch (err) {
    console.log("[email-receipt] brevo fetch failed:", err.message);
  }
}

export async function sendSponsorshipNotification(env, lead) {
  const recipient = "support@bdmso.org";
  console.log(`[email-sponsorship] notifying ${recipient} for lead ${lead.leadId}`);
  if (!env.BREVO_API_KEY) return;

  const sender = parseEmailFrom(env.EMAIL_FROM);
  const submittedAt = new Date().toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" });
  const messageHtml = escapeHtml(lead.message).replace(/\n/g, "<br>");
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#0b1b3f;">
      <div style="background:#0b1b3f;padding:24px 28px;border-radius:12px 12px 0 0;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.18em;color:#fcd34d;text-transform:uppercase;">New Sponsorship Enquiry</div>
        <h1 style="margin:6px 0 0;color:white;font-size:20px;">${escapeHtml(lead.organization)}</h1>
      </div>
      <div style="background:white;border:1px solid #e5e7eb;border-top:none;padding:24px 28px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr style="border-bottom:1px solid #f3f4f6;"><td style="padding:9px 0;color:#6b7280;">Contact</td><td style="padding:9px 0;font-weight:600;text-align:right;">${escapeHtml(lead.contactPerson)}</td></tr>
          <tr style="border-bottom:1px solid #f3f4f6;"><td style="padding:9px 0;color:#6b7280;">Email</td><td style="padding:9px 0;font-weight:600;text-align:right;"><a href="mailto:${escapeHtml(lead.email)}" style="color:#0b1b3f;">${escapeHtml(lead.email)}</a></td></tr>
          ${lead.phone ? `<tr style="border-bottom:1px solid #f3f4f6;"><td style="padding:9px 0;color:#6b7280;">Phone</td><td style="padding:9px 0;font-weight:600;text-align:right;">${escapeHtml(lead.phone)}</td></tr>` : ""}
          <tr style="border-bottom:1px solid #f3f4f6;"><td style="padding:9px 0;color:#6b7280;">Interested in</td><td style="padding:9px 0;font-weight:600;text-align:right;">${escapeHtml(lead.interest)}</td></tr>
          <tr style="border-bottom:1px solid #f3f4f6;"><td style="padding:9px 0;color:#6b7280;">Source</td><td style="padding:9px 0;font-weight:600;text-align:right;">${escapeHtml(lead.sourcePage || "-")}</td></tr>
          <tr><td style="padding:9px 0;color:#6b7280;">Submitted</td><td style="padding:9px 0;font-weight:600;text-align:right;">${escapeHtml(submittedAt)}</td></tr>
        </table>
        <div style="margin-top:18px;padding:16px 18px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;line-height:1.6;color:#374151;">
          ${messageHtml}
        </div>
        <div style="margin-top:18px;font-size:12px;color:#9ca3af;">Lead ID: <code>${escapeHtml(lead.leadId)}</code></div>
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
        to: [{ email: recipient, name: "BdMSO Partnerships" }],
        replyTo: { email: lead.email, name: lead.contactPerson },
        subject: `New sponsorship enquiry - ${lead.organization}`,
        htmlContent: html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.log(`[email-sponsorship] brevo error ${res.status}: ${body}`);
    }
  } catch (err) {
    console.log("[email-sponsorship] brevo fetch failed:", err.message);
  }
}

export async function assignMemberIdAndSendReceipt(env, tranId, baseUrl) {
  // The BdMSO ID belongs to the guardian account (one student per
  // account, format BdMSOYY0C-XXX). Minted once on the account's first
  // paid receipt, then reused for every program the student joins.
  const row = await env.DB.prepare(`
    SELECT r.id, r.guardian_account_id, r.registration_type, r.student_full_name,
           r.student_class_name, r.student_school, r.student_district, r.guardian_full_name,
           r.guardian_email, r.program_options,
           a.member_id AS account_member_id,
           a.email     AS account_email,
           p.amount, p.tran_id, p.updated_at AS paid_at
    FROM registrations r
    JOIN payments p ON p.registration_id = r.id
    JOIN guardian_accounts a ON a.id = r.guardian_account_id
    WHERE p.tran_id = ? LIMIT 1
  `).bind(tranId).first();

  if (!row) return;

  let memberId = row.account_member_id;
  if (!memberId) {
    const classDigit = parseClassDigit(row.student_class_name);
    const year       = new Date().getUTCFullYear();
    memberId = await reserveMemberId(env, year, classDigit);
    const result = await env.DB.prepare(
      "UPDATE guardian_accounts SET member_id = ? WHERE id = ? AND member_id IS NULL"
    ).bind(memberId, row.guardian_account_id).run();
    // Race: another concurrent payment for this account may have minted
    // first - read back the winner's value.
    if (!result.meta?.changes) {
      const actual = await env.DB.prepare(
        "SELECT member_id FROM guardian_accounts WHERE id = ?"
      ).bind(row.guardian_account_id).first();
      memberId = actual?.member_id || memberId;
    }
  }

  // Receipts go to the account's current (verified) email - the guardian
  // may have changed it since this registration row was first created.
  const optionLabels = programHasOptions(row.registration_type)
    ? getOptionLabels(row.registration_type, safeParseIds(row.program_options))
    : [];
  await sendReceiptEmail(
    env,
    { ...row, guardian_email: row.account_email || row.guardian_email, tran_id: tranId },
    memberId,
    baseUrl,
    { kind: "initial", optionLabels }
  );
}

function safeParseIds(json) {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

// Re-issue a receipt after a guardian option change. Reads the current
// state of the registration + every paid payment for cumulative totals,
// then sends an 'updated' receipt that supersedes the previous one.
// Caller has already committed the program_options change; this is
// purely the notification side.
export async function sendUpdatedReceiptForRegistration(env, registrationId, baseUrl) {
  const row = await env.DB.prepare(`
    SELECT r.id, r.guardian_account_id, r.registration_type, r.student_full_name,
           r.student_class_name, r.student_school, r.student_district, r.guardian_full_name,
           r.guardian_email, r.program_options,
           a.member_id AS account_member_id,
           a.email     AS account_email
    FROM registrations r
    JOIN guardian_accounts a ON a.id = r.guardian_account_id
    WHERE r.id = ? LIMIT 1
  `).bind(registrationId).first();
  if (!row) return;

  // Cumulative total + the most recent paid payment supply the txn id /
  // "updated on" stamp. A registration with no paid payments yet is
  // skipped - there is nothing to supersede.
  const paid = await env.DB.prepare(`
    SELECT tran_id, amount, updated_at
    FROM payments
    WHERE registration_id = ? AND status = 'paid'
    ORDER BY updated_at DESC
  `).bind(registrationId).all();
  const rows = paid?.results || [];
  if (!rows.length) return;
  const cumulativeAmount = rows.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const latest = rows[0];

  const optionLabels = programHasOptions(row.registration_type)
    ? getOptionLabels(row.registration_type, safeParseIds(row.program_options))
    : [];

  await sendReceiptEmail(
    env,
    {
      ...row,
      guardian_email: row.account_email || row.guardian_email,
      tran_id: latest.tran_id,
      amount: latest.amount,
      paid_at: new Date().toISOString(),
    },
    row.account_member_id,
    baseUrl,
    { kind: "updated", optionLabels, cumulativeAmount }
  );
}

export async function sendVerificationEmail(env, email, verifyUrl) {
  // Dev: print the full verify URL so it's pasteable when the recipient
  // inbox doesn't show the mail (spam, blocked sender, BD ISP
  // filtering). Production: redact both - the email is enough to
  // correlate with the DB token row by first 8 chars; the full URL
  // never goes to the log buffer.
  if (isDev(env)) {
    console.log(`[email-verify] ${email} → ${verifyUrl}`);
  } else {
    const tokenPart = (verifyUrl.match(/token=([^&]+)/) || [])[1] || "";
    console.log(`[email-verify] ${maskEmailForLog(email)} → token=${maskTokenForLog(tokenPart)}`);
  }

  if (!env.BREVO_API_KEY) {
    console.log("[email-verify] skipped: BREVO_API_KEY not set");
    return;
  }
  if (!env.EMAIL_FROM) {
    console.log("[email-verify] skipped: EMAIL_FROM not set");
    return;
  }

  const sender = parseEmailFrom(env.EMAIL_FROM);
  console.log(`[email-verify] brevo send: from=${sender.email} to=${maskEmailForLog(email)}`);

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
    const body = await res.text().catch(() => "");
    if (!res.ok) {
      console.log(`[email-verify] brevo error ${res.status}: ${body}`);
    } else {
      // Brevo returns { messageId: "<...>" } on success - log it so we
      // can correlate with their dashboard if the recipient doesn't see it.
      let parsed = {};
      try { parsed = JSON.parse(body); } catch {}
      console.log(`[email-verify] brevo accepted: messageId=${parsed.messageId || "(none)"}`);
    }
  } catch (err) {
    console.log("[email-verify] brevo fetch failed:", err.message);
  }
}

export async function sendPasswordResetEmail(env, email, resetUrl) {
  if (isDev(env)) {
    console.log(`[email-reset] ${email} → ${resetUrl}`);
  } else {
    const tokenPart = (resetUrl.match(/token=([^&]+)/) || [])[1] || "";
    console.log(`[email-reset] ${maskEmailForLog(email)} → token=${maskTokenForLog(tokenPart)}`);
  }

  if (!env.BREVO_API_KEY) {
    console.log("[email-reset] skipped: BREVO_API_KEY not set");
    return;
  }
  if (!env.EMAIL_FROM) {
    console.log("[email-reset] skipped: EMAIL_FROM not set");
    return;
  }

  const sender = parseEmailFrom(env.EMAIL_FROM);
  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 520px; margin: 0 auto;">
      <h2 style="color: #0b1b3f;">Reset your BdMSO password</h2>
      <p>We received a request to reset the password for your BdMSO account. Click the button below to choose a new password:</p>
      <p style="margin: 24px 0;">
        <a href="${resetUrl}" style="background: #0b1b3f; color: white; padding: 12px 24px; border-radius: 10px; text-decoration: none; display: inline-block; font-weight: 600;">Reset my password</a>
      </p>
      <p style="color: #666; font-size: 13px;">Or copy this link into your browser:<br><span style="word-break: break-all;">${resetUrl}</span></p>
      <p style="color: #999; font-size: 12px; margin-top: 32px;">This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email - your password will not change.</p>
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
        subject: "Reset your BdMSO password",
        htmlContent: html,
      }),
    });
    const body = await res.text().catch(() => "");
    if (!res.ok) console.log(`[email-reset] brevo error ${res.status}: ${body}`);
    else console.log("[email-reset] brevo accepted");
  } catch (err) {
    console.log("[email-reset] brevo fetch failed:", err.message);
  }
}

// Broadcast: one branded announcement to many guardians. Uses Brevo
// messageVersions so every recipient gets their own copy (no shared
// To: header), chunked so a large send still goes out in a few calls.
export async function sendBroadcastEmail(env, { subject, message, recipients }) {
  console.log(`[email-broadcast] "${subject}" -> ${recipients.length} recipient(s)`);
  if (!env.BREVO_API_KEY) {
    console.log("[email-broadcast] skipped: BREVO_API_KEY not set");
    return { sent: 0, failed: recipients.length };
  }

  const sender   = parseEmailFrom(env.EMAIL_FROM);
  const bodyHtml = escapeHtml(message).replace(/\r?\n/g, "<br>");
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#0b1b3f;">
      <div style="background:#0b1b3f;padding:22px 28px;border-radius:12px 12px 0 0;text-align:center;">
        <img src="https://bdmso.org/images/logo.webp" alt="BdMSO" width="130" style="display:block;margin:0 auto;border:0;">
      </div>
      <div style="background:white;border:1px solid #e5e7eb;border-top:none;padding:26px 30px;border-radius:0 0 12px 12px;font-size:14px;line-height:1.65;color:#374151;">
        ${bodyHtml}
      </div>
      <p style="text-align:center;color:#9ca3af;font-size:11px;margin:14px 0 0;">Bangladesh Mathematics &amp; Science Olympiad</p>
    </div>`;

  let sent = 0, failed = 0;
  for (let i = 0; i < recipients.length; i += 500) {
    const chunk = recipients.slice(i, i + 500);
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
          subject,
          htmlContent: html,
          messageVersions: chunk.map((email) => ({ to: [{ email }] })),
        }),
      });
      if (res.ok) {
        sent += chunk.length;
      } else {
        failed += chunk.length;
        const t = await res.text().catch(() => "");
        console.log(`[email-broadcast] brevo error ${res.status}: ${t}`);
      }
    } catch (err) {
      failed += chunk.length;
      console.log("[email-broadcast] brevo fetch failed:", err.message);
    }
  }
  return { sent, failed };
}
