export function buildFunctionUrl(name) {
  return `/api/${name}`;
}

export async function postJson(functionName, payload, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const response = await fetch(buildFunctionUrl(functionName), {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = data?.error || "The request could not be completed.";
    throw new Error(message);
  }

  return data;
}
