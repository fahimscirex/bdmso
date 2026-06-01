import { spawn } from "node:child_process";

// The Astro dev server serves the site (with HMR) and proxies /api to the
// worker running under `wrangler dev` (see vite.server.proxy in astro.config).
// Visit the Astro dev URL (printed below, :4321); /api/* hits the worker.
const procs = [
  { name: "worker", cmd: "npx",  args: ["wrangler", "dev", "--port", "8787"] },
  { name: "astro",  cmd: "pnpm", args: ["--filter", "@bdmso/static", "dev"] },
];

const children = procs.map(({ name, cmd, args }) => {
  const child = spawn(cmd, args, { stdio: "inherit", shell: false });
  child.on("exit", (code, signal) => {
    console.log(`[${name}] exited (code=${code} signal=${signal})`);
    shutdown();
  });
  return child;
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    if (!c.killed) c.kill("SIGTERM");
  }
  setTimeout(() => process.exit(0), 200);
}

process.on("SIGINT",  shutdown);
process.on("SIGTERM", shutdown);
