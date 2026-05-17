// Dev orchestrator for the admin SPA. Spawns wrangler dev (API on :8787) and
// the admin Vite server (HMR on :5174) side by side. Ctrl-C kills both.
//
// Use this when working on the admin dashboard. For the guardian dashboard,
// substitute @bdmso/admin → @bdmso/guardian and :5174 → :5173.

import { spawn } from "node:child_process";

// Port overrides (in priority order, env wins): WRANGLER_PORT, VITE_PORT.
// Defaults match vite.config.ts and wrangler's stock port.
const wranglerPort = process.env.WRANGLER_PORT || "8787";
const vitePort     = process.env.VITE_PORT     || "5174";

const procs = [
  { name: "wrangler", cmd: "wrangler", args: ["dev", "--live-reload", `--port=${wranglerPort}`] },
  { name: "admin",    cmd: "pnpm",     args: ["--filter", "@bdmso/admin", "dev"],
    env: { ...process.env, VITE_PORT: vitePort, WRANGLER_PORT: wranglerPort } },
];

console.log(`[dev-admin] wrangler on :${wranglerPort}, vite on :${vitePort}`);
const children = procs.map(({ name, cmd, args, env }) => {
  const child = spawn(cmd, args, { stdio: "inherit", shell: false, env: env || process.env });
  child.on("exit", (code, signal) => {
    console.log(`[${name}] exited (code=${code} signal=${signal})`);
    shutdown();
  });
  return { name, child };
});

function shutdown() {
  for (const { child } of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
