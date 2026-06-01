// Email verification tokens + transactional emails (receipts, sponsorship
// notifications, verification links) via Brevo (formerly Sendinblue).

import { normalizeString, escapeHtml } from "./validation.js";
import { reserveMemberId, parseClassDigit } from "./util.js";
import { loadCatalog } from "./programs.js";

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
// an explicit binding set in .dev.vars or the [env.production.vars]
// block of wrangler.toml.
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

  const catalog = await loadCatalog(env);
  const programName = catalog.nameFor(reg.registration_type);
  // Absolute logo URL - emails can't use relative paths. Falls back to
  // the canonical domain if the caller didn't pass a request base.
  const logoBase = baseUrl || "https://bdmso.org";
  const paidAt = new Date(reg.paid_at || Date.now()).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric"
  });
  const totalAmount = isUpdated && cumulativeAmount != null ? cumulativeAmount : reg.amount;
  const amountFormatted = `৳ ${Number(totalAmount).toLocaleString("en-BD")}`;
  // Public-facing receipt number, mirrored from the dashboard printable
  // (apps/guardian/src/pages/Home.tsx printReceipt). BdMSO- prefix plus
  // the last 8 chars of the txn id keeps it unique without exposing
  // gateway internals.
  const receiptNo = `BdMSO-${String(reg.tran_id || reg.id || "").slice(-8).toUpperCase()}`;
  const issuedLabel = new Date().toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  console.log(`[email-receipt] ${maskEmailForLog(reg.guardian_email)} → member ${memberId} (${kind})`);
  if (!env.BREVO_API_KEY) return;

  const sender = parseEmailFrom(env.EMAIL_FROM);

  // Updated-receipt banner: thin blue stripe above the header. The
  // printable doesn't need this (one printable = one paid state),
  // but the inbox does because guardians keep both initial and
  // updated receipts in their thread history.
  const updatedBanner = isUpdated ? `
        <tr><td style="padding:0 24px 14px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;">
            <tr><td style="padding:12px 16px;color:#1e3a8a;font-size:13px;line-height:1.55;">
              <strong>Updated receipt.</strong> You changed your selection for this registration; this receipt supersedes the one issued previously.
            </td></tr>
          </table>
        </td></tr>` : "";

  const optionsRow = optionLabels.length ? `
            <tr>
              <td style="padding:8px 0;font-size:12.5px;color:#5b6573;font-weight:500;border-bottom:1px solid #e8eaef;">Selection</td>
              <td style="padding:8px 0;font-size:13px;color:#15233f;font-weight:600;text-align:right;border-bottom:1px solid #e8eaef;">${optionLabels.map(escapeHtml).join("<br>")}</td>
            </tr>` : "";

  // ── Email template ────────────────────────────────────────────────
  // Tables for layout (Outlook + most inboxes treat flex/grid as
  // suggestions at best). Inline styles only - the printable's CSS
  // variables (--navy etc.) are inlined here as literals so the
  // visual matches. System font stack instead of IBM Plex; web fonts
  // are unreliable in clients like Outlook desktop.
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BdMSO Receipt - ${escapeHtml(receiptNo)}</title>
</head>
<body style="margin:0;padding:24px 12px;background:linear-gradient(170deg,#eceef2 0%,#e0e3ea 100%);font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#15233f;-webkit-font-smoothing:antialiased;">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;margin:0 auto;border-collapse:collapse;background:#f3f4f7;border-radius:18px;box-shadow:0 24px 48px -28px rgba(21,35,63,0.35);">
  <tr><td style="padding:30px 28px 8px;">${updatedBanner ? "" : ""}

    <!-- Header: logo + doc label + receipt number -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td valign="top" style="padding:0;">
          <img src="${logoBase}/images/logo.webp" alt="BdMSO" height="42" style="height:42px;width:auto;display:block;border:0;">
          <div style="margin-top:14px;font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#9aa1ad;">${isUpdated ? "Updated Receipt" : "Payment Receipt"}</div>
          <div style="margin-top:4px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:14px;font-weight:600;color:#15233f;letter-spacing:0.02em;">${escapeHtml(receiptNo)}</div>
          <div style="margin-top:4px;font-size:11px;color:#9aa1ad;">Issued ${escapeHtml(issuedLabel)}</div>
        </td>
      </tr>
    </table>

    <!-- Hero amount -->
    <div style="margin:22px 0 22px;">
      <div style="font-size:34px;font-weight:700;letter-spacing:-0.025em;line-height:1;color:#15233f;">${escapeHtml(amountFormatted)} <span style="font-size:17px;font-weight:600;color:#15803d;letter-spacing:0;">paid</span></div>
      <div style="margin-top:10px;font-size:13px;color:#5b6573;">${isUpdated ? "Updated on " : "Paid on "}${escapeHtml(paidAt)} &middot; ${escapeHtml(programName)}</div>
    </div>

  </td></tr>${updatedBanner}<tr><td style="padding:0 28px;">

    <!-- Payment Details card -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;background:white;border:1px solid #e8eaef;border-radius:13px;box-shadow:0 6px 16px -12px rgba(21,35,63,0.20);margin-bottom:14px;">
      <tr><td style="padding:20px 22px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.13em;text-transform:uppercase;color:#9aa1ad;margin-bottom:12px;">Payment Details</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:8px 0;font-size:12.5px;color:#5b6573;font-weight:500;border-bottom:1px solid #e8eaef;">Receipt number</td>
            <td style="padding:8px 0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;color:#15233f;font-weight:500;text-align:right;border-bottom:1px solid #e8eaef;">${escapeHtml(receiptNo)}</td>
          </tr>
          ${reg.payment_method ? `<tr>
            <td style="padding:8px 0;font-size:12.5px;color:#5b6573;font-weight:500;border-bottom:1px solid #e8eaef;">Payment method</td>
            <td style="padding:8px 0;font-size:13px;color:#15233f;font-weight:600;text-align:right;border-bottom:1px solid #e8eaef;">${escapeHtml(reg.payment_method)}</td>
          </tr>` : ""}
          ${reg.tran_id ? `<tr>
            <td style="padding:8px 0;font-size:12.5px;color:#5b6573;font-weight:500;border-bottom:1px solid #e8eaef;">Transaction ID</td>
            <td style="padding:8px 0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;color:#15233f;font-weight:500;text-align:right;border-bottom:1px solid #e8eaef;word-break:break-all;">${escapeHtml(reg.tran_id)}</td>
          </tr>` : ""}
          ${memberId ? `<tr>
            <td style="padding:8px 0;font-size:12.5px;color:#5b6573;font-weight:500;border-bottom:1px solid #e8eaef;">BdMSO ID</td>
            <td style="padding:8px 0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;color:#15233f;font-weight:500;text-align:right;border-bottom:1px solid #e8eaef;">${escapeHtml(memberId)}</td>
          </tr>` : ""}
          <tr>
            <td style="padding:8px 0;font-size:12.5px;color:#5b6573;font-weight:500;">Billed to</td>
            <td style="padding:8px 0;font-size:13px;color:#15233f;font-weight:600;text-align:right;word-break:break-all;">${escapeHtml(reg.guardian_email)}</td>
          </tr>
        </table>
      </td></tr>
    </table>

    <!-- Registration card with line item + total -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;background:white;border:1px solid #e8eaef;border-radius:13px;box-shadow:0 6px 16px -12px rgba(21,35,63,0.20);margin-bottom:14px;">
      <tr><td style="padding:20px 22px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.13em;text-transform:uppercase;color:#9aa1ad;margin-bottom:14px;">Registration</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
          <tr>
            <td valign="top" style="padding-bottom:14px;">
              <div style="font-size:14.5px;font-weight:700;color:#15233f;">${escapeHtml(programName)}</div>
              ${optionLabels.length ? `<div style="margin-top:4px;font-size:12px;font-weight:600;color:#15233f;">${optionLabels.map(escapeHtml).join(" &middot; ")}</div>` : ""}
              <div style="margin-top:4px;font-size:12px;color:#9aa1ad;line-height:1.5;">${escapeHtml([reg.student_full_name, reg.student_class_name, reg.student_school, reg.student_district].filter(Boolean).join(" · "))}</div>
              ${reg.guardian_full_name ? `<div style="margin-top:6px;font-size:11.5px;color:#5b6573;">Guardian: <span style="color:#15233f;font-weight:600;">${escapeHtml(reg.guardian_full_name)}</span></div>` : ""}
            </td>
            <td valign="top" align="right" style="padding-bottom:14px;font-size:14.5px;font-weight:700;color:#15233f;white-space:nowrap;">${escapeHtml(amountFormatted)}</td>
          </tr>
          <tr><td colspan="2" style="border-top:2px solid #15233f;padding-top:12px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
              <tr>
                <td style="font-size:13px;font-weight:700;color:#15233f;">${isUpdated ? "Total paid" : "Total paid"}</td>
                <td align="right" style="font-size:19px;font-weight:700;color:#15233f;letter-spacing:-0.01em;">${escapeHtml(amountFormatted)}</td>
              </tr>
            </table>
          </td></tr>
        </table>
      </td></tr>
    </table>

    <!-- Notes -->
    <div style="padding:6px 4px 0;">
      <p style="margin:0 0 7px;font-size:11px;line-height:1.65;color:#5b6573;">This is an electronic receipt for your BdMSO enrollment. Please retain it for your records - you may be asked to show it on program day. For any questions or corrections, email <strong style="color:#15233f;font-weight:600;">support@bdmso.org</strong> and quote your BdMSO ID.</p>
      <p style="margin:0;font-size:11px;line-height:1.65;color:#5b6573;"><strong style="color:#15233f;font-weight:600;">Refund policy:</strong> Any transaction made through the BdMSO website is non-refundable.</p>
    </div>

    <!-- Footer -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-top:18px;padding-top:16px;border-top:1px solid #e8eaef;">
      <tr>
        <td valign="bottom" style="font-size:10.5px;line-height:1.6;color:#9aa1ad;">
          <strong style="display:block;color:#15233f;font-size:11.5px;font-weight:700;margin-bottom:3px;">Bangladesh Mathematics &amp; Science Olympiad</strong>
          Level 12, Building #758, Green City Center,<br>Sat Masjid Road, Dhanmondi, Dhaka 1209
        </td>
        <td valign="bottom" align="right" style="font-size:11.5px;color:#5b6573;text-align:right;white-space:nowrap;">
          <strong style="color:#15233f;font-weight:700;">Need help?</strong><br>support@bdmso.org
        </td>
      </tr>
    </table>

  </td></tr>
  <tr><td style="padding:22px;"></td></tr>
</table>

</body></html>`;

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
           a.full_name AS account_full_name,
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
  const catalog = await loadCatalog(env);
  const optionLabels = catalog.programHasOptions(row.registration_type)
    ? catalog.getOptionLabels(row.registration_type, safeParseIds(row.program_options))
    : [];
  await sendReceiptEmail(
    env,
    {
      ...row,
      // Use the account's CURRENT name + email, not the snapshot
      // captured on the registration row. Guardians who renamed
      // themselves via Profile after registering should see the new
      // name on every subsequent receipt.
      guardian_full_name: row.account_full_name || row.guardian_full_name,
      guardian_email: row.account_email || row.guardian_email,
      tran_id: tranId,
    },
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
           a.email     AS account_email,
           a.full_name AS account_full_name
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

  const catalog = await loadCatalog(env);
  const optionLabels = catalog.programHasOptions(row.registration_type)
    ? catalog.getOptionLabels(row.registration_type, safeParseIds(row.program_options))
    : [];

  await sendReceiptEmail(
    env,
    {
      ...row,
      // Account name/email override - see assignMemberIdAndSendReceipt
      // for the same pattern. Receipts always reflect the guardian's
      // current Profile values, never the registration snapshot.
      guardian_full_name: row.account_full_name || row.guardian_full_name,
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
