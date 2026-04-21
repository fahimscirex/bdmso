export function buildFunctionUrl(name) {
  return `/api/${name}`;
}

export async function postJson(functionName, payload) {
  const response = await fetch(buildFunctionUrl(functionName), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
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
