// Full-stack dev: ONE worker + all three frontends, all proxying /api to the
// single wrangler on :8787. Ctrl-C kills everything. (The per-app dev:admin /
// dev:guardian / dev:worker scripts each spawn their own wrangler, so they
// can't run together - this one shares a single worker.)
//
//   worker (wrangler)  :8787              /api + local D1
//   astro (marketing)  :4321              proxies /api -> :8787
//   admin SPA          :5174/admin/       proxies /api -> :8787
//   guardian SPA       :5173/dashboard/   proxies /api -> :8787

import { spawn } from "node:child_process";

const WRANGLER_PORT = process.env.WRANGLER_PORT || "8787";
const base = { ...process.env, WRANGLER_PORT };

const procs = [
  { name: "worker",   cmd: "wrangler", args: ["dev", `--port=${WRANGLER_PORT}`] },
  { name: "astro",    cmd: "pnpm",     args: ["--filter", "@bdmso/static", "dev"] },
  { name: "admin",    cmd: "pnpm",     args: ["--filter", "@bdmso/admin", "dev"],    env: { ...base, VITE_PORT: "5174" } },
  { name: "guardian", cmd: "pnpm",     args: ["--filter", "@bdmso/guardian", "dev"], env: { ...base, VITE_PORT: "5173" } },
];

console.log(`[dev-all] worker :${WRANGLER_PORT}  ·  astro :4321  ·  admin :5174/admin/  ·  guardian :5173/dashboard/`);

const children = procs.map(({ name, cmd, args, env }) => {
  const child = spawn(cmd, args, { stdio: "inherit", shell: false, env: env || base });
  child.on("exit", (code, signal) => {
    console.log(`[${name}] exited (code=${code} signal=${signal})`);
    shutdown();
  });
  return { name, child };
});

let down = false;
function shutdown() {
  if (down) return;
  down = true;
  for (const { child } of children) if (!child.killed) child.kill("SIGTERM");
  setTimeout(() => process.exit(0), 200);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
