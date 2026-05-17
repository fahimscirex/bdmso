// Dev orchestrator for the guardian SPA. Mirrors scripts/dev-admin.mjs but
// targets @bdmso/guardian on :5173.

import { spawn } from "node:child_process";

// Port overrides (env wins): WRANGLER_PORT, VITE_PORT. Defaults match
// vite.config.ts and wrangler's stock port.
const wranglerPort = process.env.WRANGLER_PORT || "8787";
const vitePort     = process.env.VITE_PORT     || "5173";

const procs = [
  { name: "wrangler", cmd: "wrangler", args: ["dev", "--live-reload", `--port=${wranglerPort}`] },
  { name: "guardian", cmd: "pnpm",     args: ["--filter", "@bdmso/guardian", "dev"],
    env: { ...process.env, VITE_PORT: vitePort, WRANGLER_PORT: wranglerPort } },
];

console.log(`[dev-guardian] wrangler on :${wranglerPort}, vite on :${vitePort}`);
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
