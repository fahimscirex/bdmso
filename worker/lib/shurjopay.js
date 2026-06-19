// shurjoPay client. Cloudflare-Workers-native port of the official Node
// plugin (github.com/shurjopay-plugins/sp-plugin-nodejs) - same payloads,
// just `fetch` instead of axios and a D1-backed token cache instead of
// in-memory state so multiple worker invocations don't each grant a fresh
// token on every request.
//
// Three calls cover the whole flow:
//
//   1. shurjopayGetToken(env)
//        POST /api/get_token   { username, password }
//        → { token, token_type, store_id, expires_in, ... }   (TTL ~1 hour)
//
//   2. shurjopayCreatePayment(env, payload)
//        POST /api/secret-pay  (Authorization: <token_type> <token>)
//        → { checkout_url, sp_order_id, customer_order_id, ... }
//        Caller redirects the browser to checkout_url.
//
//   3. shurjopayVerify(env, spOrderId)
//        POST /api/verification  (same auth)
//        → [ { transaction_status, sp_message, bank_status, bank_trx_id,
//              amount, received_amount, currency, method,
//              customer_order_id, date_time, ... } ]
//        Note: response is an ARRAY (their convention) - first element
//        holds the txn. Success is authoritative on sp_code === "1000" (NOT
//        transaction_status, which is rail-dependent) - see shurjopayOutcome.
//
// After the user finishes paying on the hosted page, shurjoPay redirects
// to our return_url with `?order_id=<sp_order_id>` in the query - call it
// "their order id", which is what verify() takes as input. Misleading name,
// confirmed against return.js in their usage-examples repo.

// Cap every gateway round-trip so a hung shurjoPay can't stall payment-create
// or the verify-in-callback indefinitely (the request would otherwise hang
// until the worker's own wall-clock limit). 15s is generous for these APIs.
const GATEWAY_TIMEOUT_MS = 15000;

export function getShurjopayConfig(env) {
  // Endpoint selection is now driven primarily by ENVIRONMENT, with
  // SHURJOPAY_SANDBOX as a secondary override for local dev only.
  //
  //   ENVIRONMENT === "production"  -> ALWAYS engine.shurjopayment.com,
  //       regardless of SHURJOPAY_SANDBOX. This guarantees a prod deploy
  //       can't silently fall back to sandbox if the SANDBOX var is
  //       missing/misset on the worker.
  //   anything else                 -> honour SHURJOPAY_SANDBOX (default
  //       "true" so local dev hits sandbox without extra config).
  const isProd = env.ENVIRONMENT === "production";
  const sandbox = isProd ? false : ((env.SHURJOPAY_SANDBOX ?? "true") !== "false");
  const base = sandbox
    ? "https://sandbox.shurjopayment.com"
    : "https://engine.shurjopayment.com";
  // Log the resolution once per request. Visible via `wrangler tail`.
  // env-var values are non-sensitive (creds live in secrets); only the
  // routing decision is logged here.
  console.log(`[shurjopay] endpoint=${base} env=${env.ENVIRONMENT ?? "unset"} sandbox_var=${env.SHURJOPAY_SANDBOX ?? "unset"}`);
  return {
    base,
    username: env.SHURJOPAY_USERNAME || "",
    password: env.SHURJOPAY_PASSWORD || "",
    prefix:   env.SHURJOPAY_PREFIX   || "",
  };
}

export async function shurjopayGetToken(config, env) {
  // Hit the D1 cache first. Tokens live ~1 hour; we keep a 5-minute buffer
  // so a token that's *about* to expire doesn't get handed out mid-request.
  if (env?.DB) {
    const cached = await env.DB.prepare(
      "SELECT token, token_type, store_id, expires_at FROM shurjopay_token_cache WHERE id = 1 LIMIT 1"
    ).first().catch(() => null);
    if (cached && cached.expires_at > new Date().toISOString()) {
      return { token: cached.token, token_type: cached.token_type, store_id: cached.store_id };
    }
  }

  const res = await fetch(`${config.base}/api/get_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body:   JSON.stringify({ username: config.username, password: config.password }),
    signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.token) throw new Error(data.message || "shurjoPay token request failed");

  // expires_in is in seconds; subtract 5 minutes for safety.
  const ttl = Math.max(60, Number(data.expires_in || 3600) - 300);
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

  if (env?.DB) {
    env.DB.prepare(`
      INSERT INTO shurjopay_token_cache (id, token, token_type, store_id, expires_at)
      VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        token      = excluded.token,
        token_type = excluded.token_type,
        store_id   = excluded.store_id,
        expires_at = excluded.expires_at
    `).bind(data.token, data.token_type || "Bearer", String(data.store_id || ""), expiresAt)
      .run().catch(() => {});
  }

  return { token: data.token, token_type: data.token_type || "Bearer", store_id: data.store_id };
}

// Create a payment intent. `payload` carries the per-transaction fields
// (amount, customer_*, order_id, client_ip, return_url, cancel_url); the
// auth bits (token, store_id, prefix) are layered in here.
export async function shurjopayCreatePayment(config, tokenInfo, payload) {
  const body = {
    prefix:   config.prefix,
    store_id: tokenInfo.store_id,
    token:    tokenInfo.token,
    currency: "BDT",
    ...payload,
  };
  // Diagnostic: log the sanitised request body and the gateway's
  // response so we can see what shurjoPay parsed and how it answered.
  // Credentials (token, store_id) AND guardian PII (name/phone/email/
  // address - this is a minors' programme) are redacted; amount and the
  // order id stay for debugging. Workers logs are retained, so never
  // emit PII here.
  const safeBody = {
    ...body,
    token: "***", store_id: "***",
    customer_name: "***", customer_phone: "***",
    customer_email: "***", customer_address: "***",
  };
  console.log(`[shurjopay] create-payment body=${JSON.stringify(safeBody)}`);
  const res = await fetch(`${config.base}/api/secret-pay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept:         "application/json",
      Authorization:  `${tokenInfo.token_type} ${tokenInfo.token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  // Never log the full response: it carries checkout_url (a session token).
  // Mirror the redacted body above and emit only safe status fields.
  const safeResponse = {
    sp_code:           data.sp_code,
    message:           data.message ?? data.sp_message,
    transactionStatus: data.transactionStatus,
  };
  console.log(`[shurjopay] create-payment status=${res.status} response=${JSON.stringify(safeResponse)}`);
  if (!data.checkout_url) {
    throw new Error(data.message || data.sp_message || "shurjoPay create-payment failed");
  }
  return data; // { checkout_url, sp_order_id, customer_order_id, ... }
}

// Verify by the shurjoPay-side order id (what shurjoPay sends back in
// the return_url query string as `?order_id=`).
export async function shurjopayVerify(config, tokenInfo, spOrderId) {
  const res = await fetch(`${config.base}/api/verification`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept:         "application/json",
      Authorization:  `${tokenInfo.token_type} ${tokenInfo.token}`,
    },
    body: JSON.stringify({ order_id: spOrderId }),
    signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => null);
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("shurjoPay verification returned no transaction.");
  }
  return data[0]; // { sp_code, bank_status, transaction_status, method, amount, ... }
}

// Classify a verification result into 'success' | 'failed' | 'cancelled' |
// 'pending'. shurjoPay exposes THREE status-ish fields and only sp_code is
// reliable across rails:
//   sp_code            "1000" = verified/paid (authoritative, method-independent)
//   bank_status        rail outcome: "Success" | "Cancel" | "Failed" | "Pending"
//   transaction_status DESCRIPTIVE + rail-dependent: wallets (bKash/Nagad)
//                      return "Success", but IBBL i-banking / mCash return
//                      "Completed" (sometimes uppercased). Keying success off
//                      this field alone stranded those rails as pending.
// So: trust sp_code first, corroborate with bank_status, and only fall back to
// transaction_status. Unknown/transient states stay 'pending' for retry.
export function shurjopayOutcome(result) {
  const code = String(result?.sp_code ?? "").trim();
  const bank = String(result?.bank_status ?? "").trim().toLowerCase();
  const tx   = String(result?.transaction_status ?? "").trim().toLowerCase();

  if (code === "1000" || bank === "success" ||
      tx === "success" || tx === "completed" || tx === "00") return "success";
  if (bank === "cancel" || bank === "cancelled" || tx === "cancel" || tx === "cancelled") return "cancelled";
  if (bank === "failed" || tx === "failed") return "failed";
  return "pending";
}
