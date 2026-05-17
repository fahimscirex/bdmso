// Email verification tokens + transactional emails (receipts, sponsorship
// notifications, verification links) via Brevo (formerly Sendinblue).

import { normalizeString, escapeHtml } from "./validation.js";
import { reserveMemberId } from "./util.js";
import { PROGRAM_NAMES } from "./programs.js";

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

export function parseEmailFrom(raw) {
  // Accepts "Name <email@x.com>" or plain "email@x.com".
  const str = normalizeString(raw) || "BdMSO <no-reply@bdmso.org>";
  const match = str.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1] || "BdMSO", email: match[2] };
  return { name: "BdMSO", email: str };
}

export async function sendReceiptEmail(env, reg, memberId) {
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
        subject: `Payment Confirmed - ${programName} (${memberId})`,
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

export async function sendSponsorshipNotification(env, lead) {
  const recipient = "info.bdmso@gmail.com";
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

export async function assignMemberIdAndSendReceipt(env, tranId) {
  const row = await env.DB.prepare(`
    SELECT r.id, r.guardian_account_id, r.registration_type, r.student_full_name,
           r.student_class_name, r.student_school, r.student_district, r.guardian_full_name,
           r.guardian_email, p.amount, p.tran_id, p.updated_at AS paid_at,
           a.member_id AS existing_member_id
    FROM registrations r
    JOIN payments p ON p.registration_id = r.id
    JOIN guardian_accounts a ON a.id = r.guardian_account_id
    WHERE p.tran_id = ? LIMIT 1
  `).bind(tranId).first();

  if (!row) return;

  let memberId = row.existing_member_id;
  if (!memberId) {
    memberId = await reserveMemberId(env, new Date().getUTCFullYear());
    const result = await env.DB.prepare(
      "UPDATE guardian_accounts SET member_id = ? WHERE id = ? AND member_id IS NULL"
    ).bind(memberId, row.guardian_account_id).run();
    // Race: if another concurrent call won, read back the winner's value
    if (!result.meta?.changes) {
      const actual = await env.DB.prepare(
        "SELECT member_id FROM guardian_accounts WHERE id = ?"
      ).bind(row.guardian_account_id).first();
      memberId = actual?.member_id || memberId;
    }
  }

  await sendReceiptEmail(env, { ...row, tran_id: tranId }, memberId);
}

export async function sendVerificationEmail(env, email, verifyUrl) {
  // Only log in local dev - production logs should not contain bearer-style secrets.
  if (!env.BREVO_API_KEY) console.log(`[email-verify] ${email} → ${verifyUrl}`);
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
