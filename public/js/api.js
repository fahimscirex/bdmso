export function buildFunctionUrl(name) {
  return `/api/${name}`;
}

// Shared JSON sender. On a non-2xx it throws an Error whose `.message` is the
// server's error text, with `.status` and the parsed `.data` attached so
// callers can react to structured responses (e.g. a 422 with `missingFields`).
async function sendJson(method, functionName, payload, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const response = await fetch(buildFunctionUrl(functionName), {
    method,
    headers,
    credentials: "same-origin",
    body: JSON.stringify(payload)
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const err = new Error(data?.error || "The request could not be completed.");
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

export function postJson(functionName, payload, token) {
  return sendJson("POST", functionName, payload, token);
}

export function patchJson(functionName, payload, token) {
  return sendJson("PATCH", functionName, payload, token);
}
