// Dev orchestrator for the admin SPA. Spawns wrangler dev (API on :8787) and
// the admin Vite server (HMR on :5174) side by side. Ctrl-C kills both.
//
// Use this when working on the admin dashboard. For the guardian dashboard,
// substitute @bdmso/admin → @bdmso/guardian and :5174 → :5173.

import { spawn } from "node:child_process";

const procs = [
  { name: "wrangler", cmd: "wrangler",    args: ["dev", "--live-reload"] },
  { name: "admin",    cmd: "pnpm",        args: ["--filter", "@bdmso/admin", "dev"] },
];

const children = procs.map(({ name, cmd, args }) => {
  const child = spawn(cmd, args, { stdio: "inherit", shell: false });
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
