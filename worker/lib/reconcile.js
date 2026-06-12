// Payment reconciliation — verifies pending payments against ShurjoPay's
// verification API and marks them as paid or failed. Shared between the
// admin endpoint (manual, per-payment) and the scheduled handler (automatic,
// bulk).
//
// Why this exists: when the browser redirect breaks (common for card/3DS
// payments) AND the IPN never arrives, a payment stays stuck at 'pending'
// forever even though ShurjoPay already collected the money. Reconciliation
// closes that gap.

import { getShurjopayConfig, shurjopayGetToken, shurjopayVerify } from "./shurjopay.js";
import { assignMemberIdAndSendReceipt, sendUpdatedReceiptForRegistration } from "./email.js";

// Verify a single payment and update the DB if the gateway confirms it.
// Returns { status, method, error? }.
export async function reconcilePayment(env, payment, baseUrl) {
  const config    = getShurjopayConfig(env);
  const tokenInfo = await shurjopayGetToken(config, env);
  const result    = await shurjopayVerify(config, tokenInfo, payment.val_id);
  const now       = new Date().toISOString();
  const gwStatus  = result.transaction_status || result.sp_message || "Unknown";

  const isSuccess = gwStatus === "Success" || gwStatus === "00";
  if (!isSuccess) {
    await env.DB.prepare(
      "UPDATE payments SET status = 'failed', gateway_status = ?, updated_at = ? WHERE id = ? AND status = 'pending'"
    ).bind(gwStatus, now, payment.id).run();
    return { status: "failed", method: null, error: gwStatus };
  }

  // Amount sanity check — same logic as the callback handler.
  const verifiedAmount = Number(result.amount ?? result.txn_amount ?? NaN);
  const billedAmount   = Number(payment.amount);
  if (!Number.isFinite(verifiedAmount) || verifiedAmount + 0.01 < billedAmount) {
    await env.DB.prepare(
      "UPDATE payments SET status = 'failed', gateway_status = ?, updated_at = ? WHERE id = ? AND status = 'pending'"
    ).bind(`AmountMismatch:${verifiedAmount}`, now, payment.id).run();
    return { status: "failed", method: null, error: "AmountMismatch" };
  }

  // Atomically claim — same pattern as the callback handler.
  const claim = await env.DB.prepare(
    "UPDATE payments SET status = 'paid', gateway_status = 'Success', method = ?, updated_at = ? WHERE id = ? AND status = 'pending'"
  ).bind(result.method || null, now, payment.id).run();

  if (!claim?.meta || claim.meta.changes === 0) {
    return { status: "paid", method: result.method }; // already claimed
  }

  // Post-payment side effects — mirror the callback handler exactly.
  if (payment.purpose === "option-upgrade") {
    const proposed = payment.proposed_options || "[]";
    const currentRow = await env.DB.prepare(
      "SELECT program_options FROM registrations WHERE id = ? LIMIT 1"
    ).bind(payment.registration_id).first();
    const fromIds = (() => {
      try { return JSON.parse(currentRow?.program_options || "[]"); } catch { return []; }
    })();

    await env.DB.prepare("UPDATE registrations SET program_options = ? WHERE id = ?")
      .bind(proposed, payment.registration_id).run();

    try { await sendUpdatedReceiptForRegistration(env, payment.registration_id, baseUrl); }
    catch (err) { console.log("[reconcile/option-upgrade] receipt error:", err.message); }
  } else {
    await env.DB.prepare("UPDATE registrations SET status = 'paid' WHERE id = ?")
      .bind(payment.registration_id).run();
    if (payment.coupon_code) {
      await env.DB.prepare("UPDATE coupons SET used_count = used_count + 1 WHERE code = ?")
        .bind(payment.coupon_code).run();
    }
    try { await assignMemberIdAndSendReceipt(env, payment.tran_id, baseUrl); }
    catch (err) { console.log("[reconcile] receipt error:", err.message); }
  }

  return { status: "paid", method: result.method };
}

// Reconcile all pending payments older than `ageMs` (default 30 minutes).
// Returns a summary of what changed.
export async function reconcileStalePayments(env, baseUrl, ageMs = 30 * 60 * 1000) {
  const cutoff = new Date(Date.now() - ageMs).toISOString();
  const stale = await env.DB.prepare(
    "SELECT id, tran_id, val_id, amount, registration_id, coupon_code, purpose, proposed_options FROM payments WHERE status = 'pending' AND created_at < ?"
  ).bind(cutoff).all();

  if (!stale.results?.length) return { checked: 0, paid: 0, failed: 0, errors: [] };

  let paid = 0, failed = 0;
  const errors = [];

  for (const payment of stale.results) {
    try {
      const r = await reconcilePayment(env, payment, baseUrl);
      if (r.status === "paid") paid++;
      else if (r.status === "failed") failed++;
    } catch (err) {
      errors.push({ tran_id: payment.tran_id, error: err.message });
    }
  }

  return { checked: stale.results.length, paid, failed, errors };
}
