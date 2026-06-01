// Local dev watcher: when programs/posts content changes in local D1, re-run
// the materializer and rebuild the Astro static site. The worker is sandboxed
// and cannot run builds, so this separate Node process does it. Local D1 only;
// never --remote.
//
// Strategy: watch the local D1 directory for sqlite writes, debounce, then
// hash the program/post CONTENT only (not audit log / sessions / etc). Rebuild
// only when that content hash actually changes.

import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, watch } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { materialize } from './materialize.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const d1Dir = join(repoRoot, '.wrangler', 'state', 'v3', 'd1');
const d1ObjectDir = join(d1Dir, 'miniflare-D1DatabaseObject');

const DEBOUNCE_MS = 800;

// Find the local D1 sqlite file (the application DB, not metadata.sqlite).
function findSqlite() {
  if (!existsSync(d1ObjectDir)) return null;
  const files = readdirSync(d1ObjectDir).filter(
    (f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite',
  );
  return files.length ? join(d1ObjectDir, files[0]) : null;
}

// Hash the program/post CONTENT only, so unrelated writes (audit log, sessions)
// do not trigger a rebuild. Returns null if the query fails (DB not ready).
// Our own d1 reads churn the sqlite WAL inside the watched directory; suppress
// the file events they cause for a short window so the watcher doesn't loop on
// itself. Real edits arriving after the window are still picked up.
let ignoreEventsUntil = 0;

function readContentHash() {
  // Hash EVERY column of both tables, not just title/body - the grid and cards
  // also render status, home_order, schedule, price, image, etc., so an edit to
  // any of those must trigger a rebuild. Only the admin editor writes these
  // tables, so this never fires on unrelated activity.
  const sql =
    'SELECT * FROM programs ORDER BY slug; ' +
    'SELECT * FROM posts ORDER BY slug;';
  ignoreEventsUntil = Date.now() + 1500;
  try {
    const stdout = execFileSync(
      'pnpm',
      ['exec', 'wrangler', 'd1', 'execute', 'bdmso', '--local', '--json', '--command', sql],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    // Hash ONLY the row data. The raw --json output also carries a per-call
    // `meta.duration` timing field that changes every call, which would make
    // the hash differ every time and trigger an endless rebuild loop.
    const parsed = JSON.parse(stdout);
    const rows = Array.isArray(parsed) ? parsed.map((r) => r && r.results) : parsed;
    return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  } catch {
    return null;
  } finally {
    ignoreEventsUntil = Date.now() + 1500;
  }
}

let lastHash = null;
let timer = null;
let building = false;
let pending = false;

async function rebuild() {
  if (building) {
    // A build is already running; remember to re-check once it finishes.
    pending = true;
    return;
  }
  const hash = readContentHash();
  if (hash === null) return; // DB not queryable right now.
  if (hash === lastHash) return; // No content change.

  building = true;
  const started = Date.now();
  console.log('[rebuild] programs/posts changed, rebuilding...');
  try {
    await materialize();
    const res = spawnSync('pnpm', ['run', 'build:static'], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
    if (res.status !== 0) {
      console.error(`[rebuild] build:static exited with code ${res.status}`);
    } else {
      lastHash = hash;
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`[rebuild] done in ${secs}s`);
    }
  } catch (err) {
    console.error(`[rebuild] failed: ${err && err.message ? err.message : err}`);
  } finally {
    building = false;
    if (pending) {
      // Events arrived during the build; coalesce into one follow-up run.
      pending = false;
      schedule();
    }
  }
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    rebuild();
  }, DEBOUNCE_MS);
}

function onEvent() {
  // Skip the file churn our own d1 reads produce, otherwise the watcher loops
  // on itself.
  if (Date.now() < ignoreEventsUntil) return;
  schedule();
}

function startWatching(dir) {
  let recursive = true;
  try {
    watch(dir, { recursive: true }, onEvent);
  } catch {
    // recursive not supported on this platform; fall back to flat watch.
    recursive = false;
    watch(dir, onEvent);
  }
  console.log(`[rebuild] watching ${dir} (recursive=${recursive})`);
}

function main() {
  // Compute the initial hash so we do not rebuild on start (dev:one already
  // ran build:all).
  lastHash = readContentHash();
  if (lastHash === null) {
    console.warn('[rebuild] could not read initial content hash (D1 not ready yet)');
  }

  const sqlite = findSqlite();
  if (sqlite) {
    console.log(`[rebuild] local D1: ${sqlite}`);
    startWatching(d1ObjectDir);
  } else {
    console.warn(
      `[rebuild] no local D1 sqlite found under ${d1ObjectDir}; watching parent ${d1Dir} until it appears`,
    );
    if (!existsSync(d1Dir)) {
      console.warn(`[rebuild] ${d1Dir} does not exist yet; run the worker once to create it`);
      return;
    }
    startWatching(d1Dir);
  }
}

main();
