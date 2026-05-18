// shurjoPay client. Cloudflare-Workers-native port of the official Node
// plugin (github.com/shurjopay-plugins/sp-plugin-nodejs) — same payloads,
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
//        Note: response is an ARRAY (their convention) — first element
//        holds the txn. transaction_status === "Success" means paid.
//
// After the user finishes paying on the hosted page, shurjoPay redirects
// to our return_url with `?order_id=<sp_order_id>` in the query — call it
// "their order id", which is what verify() takes as input. Misleading name,
// confirmed against return.js in their usage-examples repo.

export function getShurjopayConfig(env) {
  const sandbox = (env.SHURJOPAY_SANDBOX ?? "true") !== "false";
  const base = sandbox
    ? "https://sandbox.shurjopayment.com"
    : "https://engine.shurjopayment.com";
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
  const res = await fetch(`${config.base}/api/secret-pay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept:         "application/json",
      Authorization:  `${tokenInfo.token_type} ${tokenInfo.token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
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
  });
  const data = await res.json().catch(() => null);
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("shurjoPay verification returned no transaction.");
  }
  return data[0]; // { transaction_status, bank_status, bank_trx_id, amount, ... }
}
