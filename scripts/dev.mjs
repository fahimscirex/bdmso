import { spawn } from "node:child_process";

const procs = [
  { name: "posts",    cmd: "node",        args: ["scripts/build.mjs", "--watch"] },
  { name: "wrangler", cmd: "npx",         args: ["wrangler", "dev", "--live-reload"] },
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
