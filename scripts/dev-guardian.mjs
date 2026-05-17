// Dev orchestrator for the guardian SPA. Mirrors scripts/dev-admin.mjs but
// targets @bdmso/guardian on :5173.

import { spawn } from "node:child_process";

const procs = [
  { name: "wrangler", cmd: "wrangler",    args: ["dev", "--live-reload"] },
  { name: "guardian", cmd: "pnpm",        args: ["--filter", "@bdmso/guardian", "dev"] },
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
