// Repo-backed image assets. Images live in the repo at
// apps/static/src/assets/{images,uploads}/... (the single source Astro
// optimizes at build). The worker reads them (admin previews) and writes them
// (admin uploads) WITHOUT R2:
//   - local dev: a Node sidecar (scripts/dev-asset-sink.mjs) reads/writes the
//     working tree. Enabled when env.ASSET_REPO_BASE is set.
//   - production: reads via raw.githubusercontent, writes via the GitHub
//     Contents API. Needs env.GITHUB_REPO ("owner/name"), env.GITHUB_BRANCH,
//     and the GITHUB_TOKEN secret.

const ASSET_DIR = "apps/static/src/assets";

const EXT_TYPE = {
  webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", svg: "image/svg+xml", avif: "image/avif",
};

// Map a stored logical image path to its repo-relative path under src/assets.
//   /images/x        -> apps/static/src/assets/images/x
//   /assets/uploads/x-> apps/static/src/assets/uploads/x
//   /r2/x  (legacy)  -> apps/static/src/assets/uploads/x
// Returns null for unsafe or non-local paths.
export function repoRelForLogical(logical) {
  if (!logical || /^https?:\/\//.test(logical)) return null;
  let r = logical.replace(/^\//, "");
  if (r.includes("..")) return null;
  if (r.startsWith("r2/")) r = `uploads/${r.slice("r2/".length)}`;
  else if (r.startsWith("assets/")) r = r.slice("assets/".length);
  // r is now "images/.." or "uploads/.."
  if (!/^(images|uploads)\//.test(r)) return null;
  return `${ASSET_DIR}/${r}`;
}

function typeForPath(p) {
  const ext = (p.split(".").pop() || "").toLowerCase();
  return EXT_TYPE[ext] || "application/octet-stream";
}

// Chunked base64 (avoids call-stack limits on multi-MB buffers).
function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

// Read a repo asset and return a Response (200 with image body) or null.
export async function readRepoAsset(env, repoRel) {
  if (env.ASSET_REPO_BASE) {
    const res = await fetch(`${env.ASSET_REPO_BASE}/read?path=${encodeURIComponent(repoRel)}`);
    if (!res.ok) return null;
    return new Response(res.body, {
      headers: { "content-type": typeForPath(repoRel), "cache-control": "no-store" },
    });
  }
  if (env.GITHUB_REPO) {
    const branch = env.GITHUB_BRANCH || "main";
    const url = `https://raw.githubusercontent.com/${env.GITHUB_REPO}/${branch}/${repoRel}`;
    const res = await fetch(url, { cf: { cacheTtl: 300 } });
    if (!res.ok) return null;
    return new Response(res.body, {
      headers: { "content-type": typeForPath(repoRel), "cache-control": "public, max-age=300" },
    });
  }
  return null;
}

// Write (commit) a repo asset. Throws on failure.
export async function writeRepoAsset(env, repoRel, arrayBuffer, contentType, message) {
  if (env.ASSET_REPO_BASE) {
    const res = await fetch(`${env.ASSET_REPO_BASE}/write`, {
      method: "POST",
      headers: { "x-asset-path": repoRel, "content-type": contentType || "application/octet-stream" },
      body: arrayBuffer,
    });
    if (!res.ok) throw new Error(`asset sink write failed (${res.status})`);
    return;
  }
  if (!env.GITHUB_REPO || !env.GITHUB_TOKEN) {
    throw new Error("Uploads not configured: set ASSET_REPO_BASE (dev) or GITHUB_REPO + GITHUB_TOKEN (prod).");
  }
  const branch = env.GITHUB_BRANCH || "main";
  const api = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${repoRel.split("/").map(encodeURIComponent).join("/")}`;
  const res = await fetch(api, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: "application/vnd.github+json",
      "user-agent": "bdmso-admin",
      "content-type": "application/json",
    },
    body: JSON.stringify({ message, branch, content: toBase64(arrayBuffer) }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`GitHub commit failed (${res.status}): ${detail.slice(0, 200)}`);
  }
}
