// Payment reconciliation — verifies pending payments against ShurjoPay's
// verification API and marks them as paid or failed. Shared between the
// admin endpoint (manual, per-payment) and the scheduled handler (automatic,
// bulk).
//
// Why this exists: when the browser redirect breaks (common for card/3DS
// payments) AND the IPN never arrives, a payment stays stuck at 'pending'
// forever even though ShurjoPay already collected the money. Reconciliation
// closes that gap.

import { getShurjopayConfig, shurjopayGetToken, shurjopayVerify, shurjopayOutcome } from "./shurjopay.js";
import { amountCoversBilled } from "./util.js";
import { assignMemberIdAndSendReceipt, sendUpdatedReceiptForRegistration } from "./email.js";

// Transient states (Initiated/Pending) that are older than this are
// treated as terminal — the user abandoned checkout.
const TRANSIENT_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours

// Verify a single payment and update the DB if the gateway confirms it.
// Returns { status, method, error? }.
export async function reconcilePayment(env, payment, baseUrl) {
  const config    = getShurjopayConfig(env);
  const tokenInfo = await shurjopayGetToken(config, env);
  const result    = await shurjopayVerify(config, tokenInfo, payment.val_id);
  const now       = new Date().toISOString();
  // gwStatus is what we persist for display; the success DECISION uses
  // shurjopayOutcome (sp_code-first), not this descriptive string.
  const gwStatus  = result.transaction_status || result.bank_status || result.sp_message || "Unknown";
  const outcome   = shurjopayOutcome(result);

  if (outcome !== "success") {
    if (outcome === "cancelled" || outcome === "failed") {
      await env.DB.prepare(
        "UPDATE payments SET status = 'failed', gateway_status = ?, updated_at = ? WHERE id = ? AND status = 'pending'"
      ).bind(gwStatus, now, payment.id).run();
      return { status: "failed", method: null, error: gwStatus };
    }
    const ageMs = Date.now() - new Date(payment.created_at ?? "").getTime();
    const isStale = isNaN(ageMs) || ageMs > TRANSIENT_TIMEOUT_MS;
    if (isStale) {
      await env.DB.prepare(
        "UPDATE payments SET status = 'failed', gateway_status = ?, updated_at = ? WHERE id = ? AND status = 'pending'"
      ).bind(`Stale:${gwStatus}`, now, payment.id).run();
      return { status: "failed", method: null, error: `Stale:${gwStatus}` };
    }
    await env.DB.prepare(
      "UPDATE payments SET gateway_status = ?, updated_at = ? WHERE id = ? AND status = 'pending'"
    ).bind(gwStatus, now, payment.id).run();
    return { status: "pending", method: null, error: gwStatus };
  }

  // Amount sanity check — same logic as the callback handler.
  const verifiedAmount = Number(result.amount ?? result.txn_amount ?? NaN);
  const billedAmount   = Number(payment.amount);
  if (!amountCoversBilled(verifiedAmount, billedAmount)) {
    await env.DB.prepare(
      "UPDATE payments SET status = 'failed', gateway_status = ?, updated_at = ? WHERE id = ? AND status = 'pending'"
    ).bind(`AmountMismatch:${verifiedAmount}`, now, payment.id).run();
    return { status: "failed", method: null, error: "AmountMismatch" };
  }

  // Atomically claim — same pattern as the callback handler. account_number
  // mirrors the live callback (method + masked wallet/card identifier).
  const claim = await env.DB.prepare(
    "UPDATE payments SET status = 'paid', gateway_status = 'Success', method = ?, account_number = ?, updated_at = ? WHERE id = ? AND status = 'pending'"
  ).bind(
    result.method || null,
    result.account_number || result.card_number || result.phone_no || null,
    now, payment.id,
  ).run();

  if (!claim?.meta || claim.meta.changes === 0) {
    return { status: "paid", method: result.method }; // already claimed
  }

  // Post-payment side effects — mirror the callback handler exactly.
  if (payment.purpose === "option-upgrade") {
    const proposed = payment.proposed_options || "[]";
    await env.DB.prepare("UPDATE registrations SET program_options = ? WHERE id = ?")
      .bind(proposed, payment.registration_id).run();

    try { await sendUpdatedReceiptForRegistration(env, payment.registration_id, baseUrl); }
    catch (err) { console.log("[reconcile/option-upgrade] receipt error:", err.message); }
  } else {
    await env.DB.prepare("UPDATE registrations SET status = 'paid' WHERE id = ?")
      .bind(payment.registration_id).run();
    if (payment.coupon_code) {
      // Guard against over-redemption: only increment while uses remain. 0 rows
      // changed means the coupon is already exhausted - log it so an
      // over-issued limited-use coupon is visible rather than silently ignored.
      const bump = await env.DB.prepare(
        "UPDATE coupons SET used_count = used_count + 1 WHERE code = ? AND (max_uses IS NULL OR used_count < max_uses)"
      ).bind(payment.coupon_code).run();
      if (!bump?.meta || bump.meta.changes === 0) {
        console.log(`[reconcile] coupon ${payment.coupon_code} exhausted; redemption not counted for ${payment.tran_id}`);
      }
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
  // Guard the pre-loop query: if D1 errors here we have no rows to iterate, so
  // return a summary carrying the error instead of throwing out of the cron.
  let stale;
  try {
    stale = await env.DB.prepare(
      "SELECT id, tran_id, val_id, amount, created_at, registration_id, coupon_code, purpose, proposed_options FROM payments WHERE status = 'pending' AND created_at < ?"
    ).bind(cutoff).all();
  } catch (err) {
    return { checked: 0, paid: 0, failed: 0, errors: [{ tran_id: null, error: `query: ${err.message}` }] };
  }

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
