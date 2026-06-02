// Local asset sidecar for `wrangler dev`. A Worker can't touch the repo
// filesystem, so in dev the worker proxies admin image reads/writes here
// (see worker/lib/repoAssets.js, ASSET_REPO_BASE in wrangler.toml):
//   GET  /read?path=<repoRel>    -> stream the file from the working tree
//   POST /write  (x-asset-path)  -> write uploaded bytes into the working tree
// Only paths under apps/static/src/assets are allowed. Port 8799.
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize } from "node:path";
import { mkdirSync, createReadStream, existsSync, writeFileSync } from "node:fs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const ALLOW = "apps/static/src/assets/";
const PORT = 8799;

function safeRel(repoRel) {
  const norm = normalize(repoRel || "");
  return norm.startsWith(ALLOW) && !norm.includes("..") ? norm : null;
}

const server = createServer((req, res) => {
  const u = new URL(req.url, "http://127.0.0.1");

  if (req.method === "GET" && u.pathname === "/read") {
    const rel = safeRel(u.searchParams.get("path") || "");
    const abs = rel && join(repoRoot, rel);
    if (!abs || !existsSync(abs)) { res.writeHead(404); res.end(); return; }
    createReadStream(abs).pipe(res);
    return;
  }

  if (req.method === "POST" && u.pathname === "/write") {
    const rel = safeRel(String(req.headers["x-asset-path"] || ""));
    if (!rel) { res.writeHead(400); res.end("bad path"); return; }
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const abs = join(repoRoot, rel);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, Buffer.concat(chunks));
        res.writeHead(200); res.end("ok");
      } catch (e) {
        res.writeHead(500); res.end(String(e));
      }
    });
    return;
  }

  res.writeHead(404); res.end();
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[asset-sink] reading/writing apps/static/src/assets on http://127.0.0.1:${PORT}`);
});
