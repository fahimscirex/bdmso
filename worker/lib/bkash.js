// bKash Tokenized Checkout client. Sandbox + production support; tokens
// cached in D1 (bkash_token_cache) for 50 minutes to avoid grant-token
// rate limits during a busy payment window.

export function getBkashConfig(env) {
  const sandbox = (env.BKASH_SANDBOX ?? "true") !== "false";
  const base = sandbox
    ? "https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout"
    : "https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout";
  return {
    base,
    appKey:    env.BKASH_APP_KEY    || "",
    appSecret: env.BKASH_APP_SECRET || "",
    username:  env.BKASH_USERNAME   || "",
    password:  env.BKASH_PASSWORD   || "",
  };
}

export async function bkashGrantToken(config, env) {
  // Check D1 cache first - bKash tokens are valid for ~1 hour.
  if (env?.DB) {
    const cached = await env.DB.prepare(
      "SELECT id_token, expires_at FROM bkash_token_cache WHERE id = 1 LIMIT 1"
    ).first().catch(() => null);
    if (cached && cached.expires_at > new Date().toISOString()) {
      return cached.id_token;
    }
  }

  const res = await fetch(`${config.base}/token/grant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept":       "application/json",
      "username":     config.username,
      "password":     config.password,
    },
    body: JSON.stringify({ app_key: config.appKey, app_secret: config.appSecret }),
  });
  const data = await res.json();
  if (!data.id_token) throw new Error(data.statusMessage || "bKash token grant failed");

  // Cache for 50 minutes (token TTL is 60 min; 10 min buffer).
  if (env?.DB) {
    const expiresAt = new Date(Date.now() + 50 * 60 * 1000).toISOString();
    env.DB.prepare(
      "INSERT INTO bkash_token_cache (id, id_token, expires_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET id_token = excluded.id_token, expires_at = excluded.expires_at"
    ).bind(data.id_token, expiresAt).run().catch(() => {});
  }

  return data.id_token;
}

export async function bkashCreatePayment(config, idToken, { amount, merchantInvoiceNumber, callbackURL, payerReference }) {
  const res = await fetch(`${config.base}/create`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Accept":        "application/json",
      "Authorization": `Bearer ${idToken}`,
      "X-APP-Key":     config.appKey,
    },
    body: JSON.stringify({
      mode:                    "0011",
      payerReference,
      callbackURL,
      amount:                  String(amount),
      currency:                "BDT",
      intent:                  "sale",
      merchantInvoiceNumber,
    }),
  });
  const data = await res.json();
  if (data.statusCode !== "0000") throw new Error(data.statusMessage || "bKash create payment failed");
  return data; // { bkashURL, paymentID, ... }
}

export async function bkashExecutePayment(config, idToken, paymentID) {
  const res = await fetch(`${config.base}/execute`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Accept":        "application/json",
      "Authorization": `Bearer ${idToken}`,
      "X-APP-Key":     config.appKey,
    },
    body: JSON.stringify({ paymentID }),
  });
  const data = await res.json();
  if (data.statusCode !== "0000") throw new Error(data.statusMessage || "bKash execute failed");
  return data; // { trxID, transactionStatus, amount, ... }
}
