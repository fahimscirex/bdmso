// One-command local dev: build everything once, then run the single worker
// plus a watcher that rebuilds the static site when programs/posts change in
// local D1. Ctrl-C kills both; if either exits, the other is shut down.
// Local D1 only; never --remote.
//
//   worker (wrangler)  :8787   /api + local D1 + serves built static assets
//   rebuild watcher            re-materializes + rebuilds static on D1 change

import { spawn, spawnSync } from 'node:child_process';

// 1. Build everything once, to completion. Bail out if it fails.
console.log('[dev-one] building all (build:all)...');
const build = spawnSync('pnpm', ['run', 'build:all'], { stdio: 'inherit', shell: false });
if (build.status !== 0) {
  console.error(`[dev-one] build:all failed (code=${build.status}); aborting`);
  process.exit(build.status || 1);
}

// 2. Spawn the two long-running processes.
const procs = [
  {
    name: 'worker',
    cmd: 'wrangler',
    args: [
      'dev',
      '--env', 'production',
      '--var', 'SHURJOPAY_SANDBOX:true',
      '--var', 'ENVIRONMENT:development',
      // Route admin image read/write through the local sidecar (not GitHub) in dev.
      '--var', 'ASSET_REPO_BASE:http://127.0.0.1:8799',
      '--port', '8787',
      '--live-reload',
    ],
  },
  { name: 'asset-sink', cmd: 'node', args: ['scripts/dev-asset-sink.mjs'] },
  { name: 'rebuild', cmd: 'node', args: ['scripts/dev-rebuild.mjs'] },
];

console.log('[dev-one] worker :8787  ·  rebuild watcher');

const children = procs.map(({ name, cmd, args }) => {
  const child = spawn(cmd, args, { stdio: 'inherit', shell: false });
  child.on('exit', (code, signal) => {
    console.log(`[${name}] exited (code=${code} signal=${signal})`);
    shutdown();
  });
  return { name, child };
});

let down = false;
function shutdown() {
  if (down) return;
  down = true;
  for (const { child } of children) if (!child.killed) child.kill('SIGTERM');
  setTimeout(() => process.exit(0), 200);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
