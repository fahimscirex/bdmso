// Staged review-and-publish materializer + single-commit publisher.
//
// Content edits stage a pending_publish row (one per entity) instead of pushing
// to GitHub on every save. The admin "publish" action then materializes every
// pending row from D1 and commits them in ONE GitHub commit (Git Data API:
// get ref -> base tree -> blobs -> tree -> commit -> update ref).
//
// Path/frontmatter layout mirrors scripts/materialize.mjs (the local dev
// materializer) so the staged files match what Astro's content collections
// expect. The worker can't touch the filesystem, so it queries env.DB directly
// and, for posts/programs, fetches the existing repo file to preserve the few
// frontmatter fields D1 does not store (description, options label/help).

const CONTENT_BASE = "apps/static/src/content";
const BLOG_DIR     = `${CONTENT_BASE}/blog`;
const PROGRAMS_DIR = `${CONTENT_BASE}/programs`;
const DATA_DIR     = `${CONTENT_BASE}/data`;

// Whole-file JSON datasets: a single row edit rebuilds the whole file, so they
// dedupe onto ONE pending row keyed by the dataset name.
export const DATASETS = {
  press:      `${DATA_DIR}/press.json`,
  halloffame: `${DATA_DIR}/halloffame.json`,
  medalist:   `${DATA_DIR}/medalists.json`,
  team:       `${DATA_DIR}/team.json`,
};

export function isDataset(entityType) {
  return entityType in DATASETS;
}

// Repo path for any entity. For posts/programs the id is the slug; for datasets
// the path is fixed (the id is the dataset name).
export function pathFor(entityType, entityId) {
  if (entityType === "post")    return `${BLOG_DIR}/${entityId}.md`;
  if (entityType === "program") return `${PROGRAMS_DIR}/${entityId}.md`;
  if (isDataset(entityType))    return DATASETS[entityType];
  return null;
}

function dq(value) {
  return '"' + String(value).replace(/"/g, '\\"') + '"';
}
function isEmpty(value) {
  return value === null || value === undefined || value === "";
}

// Split a markdown file into { frontmatter, body }.
function splitFrontmatter(text) {
  const lines = text.split("\n");
  if (lines[0].trim() !== "---") return { frontmatter: "", body: text };
  let second = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") { second = i; break; }
  }
  if (second === -1) return { frontmatter: "", body: text };
  return {
    frontmatter: lines.slice(1, second).join("\n"),
    body: lines.slice(second + 1).join("\n"),
  };
}

function readExistingOptions(frontmatter) {
  for (const line of frontmatter.split("\n")) {
    const match = line.match(/^options:\s*(\{.*\})\s*$/);
    if (!match) continue;
    try { return JSON.parse(match[1]); } catch { return null; }
  }
  return null;
}

function readExistingValue(frontmatter, key) {
  for (const line of frontmatter.split("\n")) {
    const match = line.match(new RegExp("^" + key + ":\\s*(.*)$"));
    if (!match) continue;
    let raw = match[1].trim();
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      raw = raw.slice(1, -1);
    }
    return raw;
  }
  return null;
}

// Read the existing repo file's frontmatter text, or "" if absent / not
// configured. Dev: sidecar /read. Prod: raw.githubusercontent.
async function readExistingFrontmatter(env, repoRel) {
  let text = "";
  if (env.ASSET_REPO_BASE) {
    const res = await fetch(`${env.ASSET_REPO_BASE}/read?path=${encodeURIComponent(repoRel)}`);
    if (res.ok) text = await res.text();
  } else if (env.GITHUB_REPO) {
    const branch = env.GITHUB_BRANCH || "main";
    const res = await fetch(`https://raw.githubusercontent.com/${env.GITHUB_REPO}/${branch}/${repoRel}`);
    if (res.ok) text = await res.text();
  }
  if (!text) return "";
  return splitFrontmatter(text).frontmatter;
}

function buildProgramFrontmatter(row, existingFrontmatter) {
  const lines = [];
  if (!isEmpty(row.home_order)) lines.push(`home_order: ${dq(row.home_order)}`);
  if (!isEmpty(row.fee_amount)) lines.push(`feeAmount: ${row.fee_amount}`);
  if (!isEmpty(row.title)) lines.push(`title: ${dq(row.title)}`);
  if (!isEmpty(row.tagline)) lines.push(`tagline: ${dq(row.tagline)}`);
  if (!isEmpty(row.meta_description)) lines.push(`metaDescription: ${dq(row.meta_description)}`);
  if (!isEmpty(row.starts_on)) lines.push(`startsOn: ${dq(row.starts_on)}`);
  if (!isEmpty(row.ends_on)) lines.push(`endsOn: ${dq(row.ends_on)}`);
  if (!isEmpty(row.registration_opens)) lines.push(`registrationStarts: ${dq(row.registration_opens)}`);
  if (!isEmpty(row.registration_closes)) lines.push(`registrationEnds: ${dq(row.registration_closes)}`);
  if (row.always_open === 1) lines.push("yearRound: true");
  if (!isEmpty(row.eyebrow)) lines.push(`eyebrow: ${dq(row.eyebrow)}`);
  if (!isEmpty(row.image)) lines.push(`image: ${dq(row.image)}`);
  if (!isEmpty(row.audience)) lines.push(`audience: ${dq(row.audience)}`);
  if (!isEmpty(row.duration)) lines.push(`duration: ${dq(row.duration)}`);
  if (!isEmpty(row.format)) lines.push(`format: ${dq(row.format)}`);
  if (!isEmpty(row.outcome)) lines.push(`outcome: ${dq(row.outcome)}`);
  if (!isEmpty(row.level)) lines.push(`level: ${dq(row.level)}`);
  if (!isEmpty(row.schedule_label)) lines.push(`schedule: ${dq(row.schedule_label)}`);
  if (!isEmpty(row.price_label)) lines.push(`price: ${dq(row.price_label)}`);
  if (!isEmpty(row.register_url)) lines.push(`register_url: ${dq(row.register_url)}`);
  if (!isEmpty(row.register_label)) lines.push(`register_label: ${dq(row.register_label)}`);
  if (row.repeatable === 1) lines.push("repeatable: true");
  if (row.hidden === 1) lines.push("hidden: true");

  if (!isEmpty(row.pricing_json)) {
    let pricing = null;
    try { pricing = JSON.parse(row.pricing_json); } catch { pricing = null; }
    if (pricing && Array.isArray(pricing.choices)) {
      const opt = { kind: pricing.selection === "single" ? "radio" : "checkbox" };
      // Preserve label/help from the existing file (D1 does not store them).
      const existingOpt = readExistingOptions(existingFrontmatter);
      if (existingOpt && existingOpt.label !== undefined) opt.label = existingOpt.label;
      if (existingOpt && existingOpt.help !== undefined) opt.help = existingOpt.help;
      opt.items = pricing.choices.map((c) => ({ id: c.id, label: c.label, sub: c.note || "", price: c.price }));
      lines.push(`options: ${JSON.stringify(opt)}`);
    }
  }

  if (!isEmpty(row.category)) lines.push(`category: ${dq(row.category)}`);
  return lines;
}

function buildPostFrontmatter(row, existingFrontmatter) {
  const lines = [];
  if (!isEmpty(row.title)) lines.push(`title: ${dq(row.title)}`);
  if (!isEmpty(row.slug)) lines.push(`slug: ${row.slug}`);
  if (!isEmpty(row.category)) lines.push(`category: ${row.category}`);
  if (!isEmpty(row.published_at)) lines.push(`date: ${row.published_at}`);
  if (!isEmpty(row.author)) lines.push(`author: ${row.author}`);
  if (!isEmpty(row.excerpt)) lines.push(`excerpt: ${row.excerpt}`);
  // description: posts table has no description column - preserve from existing file.
  const description = readExistingValue(existingFrontmatter, "description");
  if (!isEmpty(description)) lines.push(`description: ${description}`);
  if (!isEmpty(row.image)) lines.push(`image: ${row.image}`);
  if (row.featured === 1) lines.push("featured: true");
  return lines;
}

function mdFile(frontmatterLines, body) {
  return "---\n" + frontmatterLines.join("\n") + "\n---\n\n" + (body || "") + "\n";
}

// Build the JSON-array content for a whole-file dataset from currently-published
// D1 rows. Mirrors scripts/materialize.mjs's queries exactly.
async function materializeDataset(env, dataset) {
  if (dataset === "press") {
    const rows = (await env.DB.prepare(
      "SELECT id, outlet, title, url, published_on, image, featured FROM press_mentions " +
      "WHERE published = 1 ORDER BY featured DESC, sort_order ASC, id ASC"
    ).all()).results || [];
    return JSON.stringify(rows.map((r) => ({
      id: String(r.id), outlet: r.outlet, title: r.title, url: r.url,
      publishedOn: r.published_on || "", image: r.image || "", featured: r.featured === 1,
    })), null, 2) + "\n";
  }
  if (dataset === "halloffame") {
    const rows = (await env.DB.prepare(
      "SELECT id, image, caption, year FROM hall_of_fame_photos WHERE published = 1 ORDER BY sort_order ASC, id ASC"
    ).all()).results || [];
    return JSON.stringify(rows.map((r) => ({
      id: String(r.id), image: r.image, caption: r.caption || "", year: r.year || "",
    })), null, 2) + "\n";
  }
  if (dataset === "medalist") {
    const rows = (await env.DB.prepare(
      "SELECT id, year, category, medal, name, school FROM medalists WHERE published = 1 " +
      "ORDER BY year DESC, category ASC, " +
      "CASE medal WHEN 'gold' THEN 0 WHEN 'silver' THEN 1 WHEN 'bronze' THEN 2 ELSE 3 END, " +
      "sort_order ASC, id ASC"
    ).all()).results || [];
    return JSON.stringify(rows.map((r) => ({
      id: String(r.id), year: r.year, category: r.category, medal: r.medal, name: r.name, school: r.school || "",
    })), null, 2) + "\n";
  }
  if (dataset === "team") {
    const rows = (await env.DB.prepare(
      "SELECT id, section, subgroup, year, name, role, affiliation, image, sort_order FROM team_members " +
      "WHERE published = 1 ORDER BY section ASC, sort_order ASC, id ASC"
    ).all()).results || [];
    return JSON.stringify(rows.map((r) => ({
      id: String(r.id), section: r.section, subgroup: r.subgroup || "", year: r.year || "",
      name: r.name, role: r.role || "", affiliation: r.affiliation || "", image: r.image || "",
    })), null, 2) + "\n";
  }
  return null;
}

// Materialize one entity to { path, content } from CURRENT D1 state. Returns
// { path, content } for a create/update, { path, content: null } for a delete
// (the file gets removed at publish), or null if the entity vanished.
export async function materializeEntity(env, entityType, entityId, action) {
  if (isDataset(entityType)) {
    return { path: DATASETS[entityType], content: await materializeDataset(env, entityType) };
  }

  if (action === "delete") {
    return { path: pathFor(entityType, entityId), content: null };
  }

  if (entityType === "post") {
    const row = await env.DB.prepare("SELECT * FROM posts WHERE slug = ? LIMIT 1").bind(entityId).first();
    if (!row) return null;
    const path = pathFor("post", entityId);
    const existing = await readExistingFrontmatter(env, path);
    return { path, content: mdFile(buildPostFrontmatter(row, existing), row.body_md || "") };
  }
  if (entityType === "program") {
    const row = await env.DB.prepare("SELECT * FROM programs WHERE slug = ? LIMIT 1").bind(entityId).first();
    if (!row) return null;
    const path = pathFor("program", entityId);
    const existing = await readExistingFrontmatter(env, path);
    return { path, content: mdFile(buildProgramFrontmatter(row, existing), row.body_md || "") };
  }
  return null;
}

// Title for a pending change, for the review list.
export async function titleFor(env, entityType, entityId) {
  if (isDataset(entityType)) {
    const labels = { press: "Press mentions", halloffame: "Hall of Fame", medalist: "Medalists", team: "Team" };
    return labels[entityType] || entityType;
  }
  const table = entityType === "post" ? "posts" : "programs";
  const row = await env.DB.prepare(`SELECT title FROM ${table} WHERE slug = ? LIMIT 1`).bind(entityId).first();
  return row?.title || entityId;
}

// ─── Publish snapshots (for discard/revert) ─────────────────────────────────
// Content edits hit D1 live, so "discard" needs a baseline to roll back to. We
// snapshot each entity's D1 row(s) at publish time (when D1 == what was just
// committed) into publish_snapshots, then restore from it on discard.

// entity_type -> { table, key (per-file id column), dataset (whole-table) }.
const ENTITY_TABLES = {
  post:       { table: "posts",               key: "slug", dataset: false },
  program:    { table: "programs",            key: "slug", dataset: false },
  press:      { table: "press_mentions",      key: "id",   dataset: true  },
  halloffame: { table: "hall_of_fame_photos", key: "id",   dataset: true  },
  medalist:   { table: "medalists",           key: "id",   dataset: true  },
  team:       { table: "team_members",        key: "id",   dataset: true  },
};

// Current D1 state for an entity: the whole table for datasets, the single row
// for per-file entities (0 or 1 rows).
async function snapshotRowsFor(env, entityType, entityId) {
  const cfg = ENTITY_TABLES[entityType];
  if (!cfg) return [];
  if (cfg.dataset) {
    return (await env.DB.prepare(`SELECT * FROM ${cfg.table}`).all()).results || [];
  }
  const row = await env.DB.prepare(`SELECT * FROM ${cfg.table} WHERE ${cfg.key} = ? LIMIT 1`).bind(entityId).first();
  return row ? [row] : [];
}

// Fields that never count as a meaningful "change" in the review diff.
const DIFF_IGNORE = new Set(["id", "slug", "created_at", "updated_at", "updated_by", "published_at"]);
// Friendly labels for the noisier column names; everything else is de-snaked.
const FIELD_LABEL = {
  registration_status: "status", schedule_label: "schedule", price_label: "price",
  fee_amount: "fee", pricing_json: "pricing/options", body_md: "body",
  meta_description: "meta description", register_url: "register link", register_label: "register button",
  home_order: "home order", registration_opens: "registration opens", registration_closes: "registration closes",
  starts_on: "start date", ends_on: "end date",
};
const prettyField = (k) => FIELD_LABEL[k] || k.replace(/_/g, " ");

// Which fields changed since the entity was last published. Compares the live
// D1 row against publish_snapshots (the post-publish baseline). Only meaningful
// for single-row entities being updated; datasets/creates/deletes return [].
export async function diffEntityFields(env, entityType, entityId, action) {
  const cfg = ENTITY_TABLES[entityType];
  if (!cfg || cfg.dataset || action !== "update") return [];
  const after = (await snapshotRowsFor(env, entityType, entityId))[0];
  if (!after) return [];
  const snap = await env.DB.prepare(
    "SELECT d1_json FROM publish_snapshots WHERE entity_type = ? AND entity_id = ? LIMIT 1"
  ).bind(entityType, entityId).first();
  let before = null;
  try { before = snap ? (JSON.parse(snap.d1_json)[0] || null) : null; } catch { before = null; }
  if (!before) return [];
  const changed = [];
  for (const k of Object.keys(after)) {
    if (DIFF_IGNORE.has(k)) continue;
    if (String(after[k] ?? "") !== String(before[k] ?? "")) changed.push(prettyField(k));
  }
  return changed;
}

function insertStmt(env, table, row) {
  const cols = Object.keys(row);
  const sql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
  return env.DB.prepare(sql).bind(...cols.map((c) => row[c]));
}

// Record the post-publish D1 state as the revert baseline for this entity.
export async function captureSnapshot(env, entityType, entityId) {
  if (!ENTITY_TABLES[entityType]) return;
  const rows = await snapshotRowsFor(env, entityType, entityId);
  await env.DB.prepare(`
    INSERT INTO publish_snapshots (entity_type, entity_id, d1_json, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(entity_type, entity_id) DO UPDATE SET
      d1_json    = excluded.d1_json,
      updated_at = datetime('now')
  `).bind(entityType, entityId, JSON.stringify(rows)).run();
}

// Roll D1 back to the last-published baseline. Returns 'restored' | 'deleted' |
// 'skipped' so the caller can report what actually reverted.
//   - snapshot present  -> replace the row / rebuild the dataset table from it
//   - no snapshot + create -> delete the never-published row(s)
//   - no snapshot + update/delete -> leave D1 untouched (no safe baseline)
export async function restoreSnapshot(env, entityType, entityId, action) {
  const cfg = ENTITY_TABLES[entityType];
  if (!cfg) return "skipped";

  const snap = await env.DB.prepare(
    "SELECT d1_json FROM publish_snapshots WHERE entity_type = ? AND entity_id = ? LIMIT 1"
  ).bind(entityType, entityId).first();

  if (!snap) {
    if (action === "create" && !cfg.dataset) {
      await env.DB.prepare(`DELETE FROM ${cfg.table} WHERE ${cfg.key} = ?`).bind(entityId).run();
      return "deleted";
    }
    return "skipped";
  }

  let rows = [];
  try { rows = JSON.parse(snap.d1_json) || []; } catch { rows = []; }

  if (cfg.dataset) {
    // Rebuild the whole table from the baseline.
    const stmts = [env.DB.prepare(`DELETE FROM ${cfg.table}`)];
    for (const row of rows) stmts.push(insertStmt(env, cfg.table, row));
    await env.DB.batch(stmts);
    return "restored";
  }

  // Per-file: drop the current row, reinstate the baseline row if one existed.
  const stmts = [env.DB.prepare(`DELETE FROM ${cfg.table} WHERE ${cfg.key} = ?`).bind(entityId)];
  if (rows[0]) stmts.push(insertStmt(env, cfg.table, rows[0]));
  await env.DB.batch(stmts);
  return rows[0] ? "restored" : "deleted";
}

// ─── Single-commit publisher ────────────────────────────────────────────────

// Dev (sidecar): just write each file; the working tree is the "commit".
async function publishViaSidecar(env, files) {
  for (const f of files) {
    if (f.content === null) {
      await fetch(`${env.ASSET_REPO_BASE}/delete`, {
        method: "POST",
        headers: { "x-asset-path": f.path },
      }).catch(() => {});
      continue;
    }
    const res = await fetch(`${env.ASSET_REPO_BASE}/write`, {
      method: "POST",
      headers: { "x-asset-path": f.path, "content-type": "text/plain; charset=utf-8" },
      body: f.content,
    });
    if (!res.ok) throw new Error(`asset sink write failed for ${f.path} (${res.status})`);
  }
  return { commit: "dev-sidecar", files: files.map((f) => f.path) };
}

async function gh(env, path, init = {}) {
  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: "application/vnd.github+json",
      "user-agent": "bdmso-admin",
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`GitHub ${path} failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  return res.json();
}

// Prod: one commit via the Git Data API.
//   get ref -> base tree -> create blobs -> create tree -> create commit -> update ref
async function publishViaGithub(env, files, message) {
  const branch = env.GITHUB_BRANCH || "main";

  const ref = await gh(env, `git/ref/heads/${branch}`);
  const baseCommitSha = ref.object.sha;
  const baseCommit = await gh(env, `git/commits/${baseCommitSha}`);
  const baseTreeSha = baseCommit.tree.sha;

  const tree = [];
  for (const f of files) {
    if (f.content === null) {
      // Deletion: a tree entry with sha:null removes the path.
      tree.push({ path: f.path, mode: "100644", type: "blob", sha: null });
      continue;
    }
    const blob = await gh(env, "git/blobs", {
      method: "POST",
      body: JSON.stringify({ content: f.content, encoding: "utf-8" }),
    });
    tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  const newTree = await gh(env, "git/trees", {
    method: "POST",
    body: JSON.stringify({ base_tree: baseTreeSha, tree }),
  });

  const commit = await gh(env, "git/commits", {
    method: "POST",
    body: JSON.stringify({ message, tree: newTree.sha, parents: [baseCommitSha] }),
  });

  await gh(env, `git/refs/heads/${branch}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha }),
  });

  return { commit: commit.sha, files: files.map((f) => f.path) };
}

// Commit a batch of { path, content } files in ONE commit. content === null
// means delete the path. Routes to the dev sidecar or the GitHub Git Data API.
export async function publishFiles(env, files, message) {
  if (env.ASSET_REPO_BASE) return publishViaSidecar(env, files);
  if (!env.GITHUB_REPO || !env.GITHUB_TOKEN) {
    throw new Error("Publishing not configured: set ASSET_REPO_BASE (dev) or GITHUB_REPO + GITHUB_TOKEN (prod).");
  }
  return publishViaGithub(env, files, message);
}
