// Materialize the LOCAL D1 `programs` and `posts` tables into Astro content
// markdown files under apps/static/src/content. Reproduces the existing
// committed frontmatter format as closely as possible. Add/update only - this
// script never deletes files. Local D1 only; never --remote.

import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { deriveCohortStage, scheduleLabelFromRuns } from '../worker/lib/program-options.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const programsDir = join(repoRoot, 'apps', 'static', 'src', 'content', 'programs');
const blogDir = join(repoRoot, 'apps', 'static', 'src', 'content', 'blog');
// List datasets (press, Hall of Fame, medalists) materialize to single JSON
// array files consumed by Astro `file()` data collections - see content.config.ts.
const dataDir = join(repoRoot, 'apps', 'static', 'src', 'content', 'data');

// Run a SQL query against local D1 and return the rows (parsed[0].results).
function queryD1(sql) {
  const stdout = execFileSync(
    'pnpm',
    ['exec', 'wrangler', 'd1', 'execute', 'bdmso', '--local', '--json', '--command', sql],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  const parsed = JSON.parse(stdout);
  return (parsed[0] && parsed[0].results) || [];
}

// Double-quoted frontmatter value: escape inner double quotes as \".
function dq(value) {
  return '"' + String(value).replace(/"/g, '\\"') + '"';
}

function isEmpty(value) {
  return value === null || value === undefined || value === '';
}

// Split a markdown file into { frontmatter, body }. Frontmatter is the text
// between the first two `---` lines.
function splitFrontmatter(text) {
  const lines = text.split('\n');
  if (lines[0].trim() !== '---') return { frontmatter: '', body: text };
  let second = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      second = i;
      break;
    }
  }
  if (second === -1) return { frontmatter: '', body: text };
  return {
    frontmatter: lines.slice(1, second).join('\n'),
    body: lines.slice(second + 1).join('\n'),
  };
}

// Read the existing file's frontmatter as raw text, or '' if no such file.
function readExistingFrontmatter(filePath) {
  if (!existsSync(filePath)) return '';
  return splitFrontmatter(readFileSync(filePath, 'utf8')).frontmatter;
}

// Parse the single-line `options: {...}` JSON object from existing frontmatter,
// or null if absent / unparseable.
function readExistingOptions(frontmatter) {
  for (const line of frontmatter.split('\n')) {
    const match = line.match(/^options:\s*(\{.*\})\s*$/);
    if (!match) continue;
    try {
      return JSON.parse(match[1]);
    } catch {
      return null;
    }
  }
  return null;
}

// Read a single bare frontmatter value (one line) from existing frontmatter,
// stripping one layer of surrounding double/single quotes. Returns null if the
// key is absent.
function readExistingValue(frontmatter, key) {
  for (const line of frontmatter.split('\n')) {
    const match = line.match(new RegExp('^' + key + ':\\s*(.*)$'));
    if (!match) continue;
    let raw = match[1].trim();
    if (
      (raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))
    ) {
      raw = raw.slice(1, -1);
    }
    return raw;
  }
  return null;
}

// Schedule for a run-priced program - the same shared builder the live
// /api/catalog uses (scheduleLabelFromRuns), so the static page matches it.
function deriveRunSchedule(cohorts) {
  return scheduleLabelFromRuns((cohorts || []).map((c) => ({
    stage: deriveCohortStage(c.status, c.enroll_opens, c.enroll_closes, c.starts_on, c.ends_on),
    startsOn: c.starts_on, endsOn: c.ends_on, enrollCloses: c.enroll_closes,
  })));
}

function buildProgramFrontmatter(row, existingFrontmatter, runSchedule) {
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
  // yearRound: emitted only for always-open (year-round) programs. The
  // registration boolean is no longer emitted - static pages derive state
  // from yearRound + the registration date window.
  if (row.always_open === 1) lines.push('yearRound: true');
  if (!isEmpty(row.eyebrow)) lines.push(`eyebrow: ${dq(row.eyebrow)}`);
  if (!isEmpty(row.image)) lines.push(`image: ${dq(row.image)}`);
  if (!isEmpty(row.audience)) lines.push(`audience: ${dq(row.audience)}`);
  if (!isEmpty(row.duration)) lines.push(`duration: ${dq(row.duration)}`);
  if (!isEmpty(row.format)) lines.push(`format: ${dq(row.format)}`);
  if (!isEmpty(row.outcome)) lines.push(`outcome: ${dq(row.outcome)}`);
  if (!isEmpty(row.level)) lines.push(`level: ${dq(row.level)}`);
  // Run-priced programs auto-generate their schedule from the runs (matches the
  // live catalog); others use the manual schedule label.
  const schedule = row.enroll_by_run === 1 ? (runSchedule || '') : row.schedule_label;
  if (!isEmpty(schedule)) lines.push(`schedule: ${dq(schedule)}`);
  if (!isEmpty(row.price_label)) lines.push(`price: ${dq(row.price_label)}`);
  if (!isEmpty(row.register_url)) lines.push(`register_url: ${dq(row.register_url)}`);
  if (!isEmpty(row.register_label)) lines.push(`register_label: ${dq(row.register_label)}`);

  if (row.repeatable === 1) lines.push('repeatable: true');
  if (row.hidden === 1) lines.push('hidden: true');

  // options: only when pricing_json is non-null.
  if (!isEmpty(row.pricing_json)) {
    let pricing = null;
    try {
      pricing = JSON.parse(row.pricing_json);
    } catch {
      pricing = null;
    }
    if (pricing && Array.isArray(pricing.choices)) {
      const opt = {
        kind: pricing.selection === 'single' ? 'radio' : 'checkbox',
      };
      // Preserve-merge label/help from the existing file (D1 does not store them).
      const existingOpt = readExistingOptions(existingFrontmatter);
      if (existingOpt && existingOpt.label !== undefined) opt.label = existingOpt.label;
      if (existingOpt && existingOpt.help !== undefined) opt.help = existingOpt.help;
      opt.items = pricing.choices.map((c) => ({
        id: c.id,
        label: c.label,
        sub: c.note || '',
        price: c.price,
      }));
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
  const description = readExistingValue(existingFrontmatter, 'description');
  if (!isEmpty(description)) lines.push(`description: ${description}`);

  if (!isEmpty(row.image)) lines.push(`image: ${row.image}`);

  if (row.featured === 1) lines.push('featured: true');

  return lines;
}

function writeContentFile(filePath, frontmatterLines, body) {
  const content =
    '---\n' + frontmatterLines.join('\n') + '\n---\n\n' + (body || '') + '\n';
  writeFileSync(filePath, content);
}

// Write a list dataset as a JSON array (one file per dataset). Each entry keeps
// its `id` so Astro's file() loader can key the collection. The whole file is
// rewritten each run, so unpublished/deleted rows drop out with no prune step.
function writeDataFile(filePath, rows) {
  writeFileSync(filePath, JSON.stringify(rows, null, 2) + '\n');
}

// Materialize the three marketing list datasets from D1 into content/data/*.json.
// Returns { press, halloffame, medalists } counts.
function materializeDatasets(written) {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  const press = queryD1(
    'SELECT id, outlet, title, url, published_on, image, featured FROM press_mentions ' +
    'WHERE published = 1 ORDER BY featured DESC, sort_order ASC, id ASC',
  ).map((r) => ({
    id: String(r.id),
    outlet: r.outlet,
    title: r.title,
    url: r.url,
    publishedOn: r.published_on || '',
    image: r.image || '',
    featured: r.featured === 1,
  }));
  writeDataFile(join(dataDir, 'press.json'), press);
  written.push('apps/static/src/content/data/press.json');

  const halloffame = queryD1(
    'SELECT id, image, caption, year FROM hall_of_fame_photos ' +
    'WHERE published = 1 ORDER BY sort_order ASC, id ASC',
  ).map((r) => ({ id: String(r.id), image: r.image, caption: r.caption || '', year: r.year || '' }));
  writeDataFile(join(dataDir, 'halloffame.json'), halloffame);
  written.push('apps/static/src/content/data/halloffame.json');

  const medalists = queryD1(
    "SELECT id, year, category, medal, name, school FROM medalists WHERE published = 1 " +
    "ORDER BY year DESC, category ASC, " +
    "CASE medal WHEN 'gold' THEN 0 WHEN 'silver' THEN 1 WHEN 'bronze' THEN 2 ELSE 3 END, " +
    "sort_order ASC, id ASC",
  ).map((r) => ({
    id: String(r.id),
    year: r.year,
    category: r.category,
    medal: r.medal,
    name: r.name,
    school: r.school || '',
  }));
  writeDataFile(join(dataDir, 'medalists.json'), medalists);
  written.push('apps/static/src/content/data/medalists.json');

  const team = queryD1(
    'SELECT id, section, subgroup, year, name, role, affiliation, image, sort_order FROM team_members ' +
    'WHERE published = 1 ORDER BY section ASC, sort_order ASC, id ASC',
  ).map((r) => ({
    id: String(r.id),
    section: r.section,
    subgroup: r.subgroup || '',
    year: r.year || '',
    name: r.name,
    role: r.role || '',
    affiliation: r.affiliation || '',
    image: r.image || '',
  }));
  writeDataFile(join(dataDir, 'team.json'), team);
  written.push('apps/static/src/content/data/team.json');

  return { press: press.length, halloffame: halloffame.length, medalists: medalists.length, team: team.length };
}

// Delete .md files whose slug is no longer in the published set (unpublished or
// deleted in D1). D1 is the source of truth, so the .md set must mirror the
// published rows exactly.
function pruneOrphans(dir, keepSlugs, label, removed) {
  if (!existsSync(dir)) return;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.md')) continue;
    const slug = file.slice(0, -3);
    if (keepSlugs.has(slug)) continue;
    try {
      unlinkSync(join(dir, file));
      const rel = `apps/static/src/content/${label}/${file}`;
      removed.push(rel);
      console.log(`removed ${rel} (no longer published)`);
    } catch (err) {
      console.error(`failed removing ${file}: ${err && err.message ? err.message : err}`);
    }
  }
}

export async function materialize() {
  const written = [];
  let programs = 0;
  let posts = 0;

  if (!existsSync(programsDir)) mkdirSync(programsDir, { recursive: true });
  if (!existsSync(blogDir)) mkdirSync(blogDir, { recursive: true });

  // === PROGRAMS ===
  const programRows = queryD1('SELECT * FROM programs WHERE published = 1');
  // Cohorts grouped by program, so run-priced programs can auto-generate their
  // schedule from the runs (see deriveRunSchedule).
  const cohortsBySlug = {};
  for (const c of queryD1('SELECT program_slug, status, enroll_opens, enroll_closes, starts_on, ends_on FROM cohorts')) {
    (cohortsBySlug[c.program_slug] ||= []).push(c);
  }
  for (const row of programRows) {
    try {
      const filePath = join(programsDir, `${row.slug}.md`);
      const existingFrontmatter = readExistingFrontmatter(filePath);
      const runSchedule = deriveRunSchedule(cohortsBySlug[row.slug]);
      const frontmatterLines = buildProgramFrontmatter(row, existingFrontmatter, runSchedule);
      writeContentFile(filePath, frontmatterLines, row.body_md);
      const rel = `apps/static/src/content/programs/${row.slug}.md`;
      written.push(rel);
      console.log(`wrote ${rel}`);
      programs += 1;
    } catch (err) {
      console.error(`failed program ${row.slug}: ${err && err.message ? err.message : err}`);
    }
  }

  // === POSTS ===
  const postRows = queryD1('SELECT * FROM posts WHERE published = 1');
  for (const row of postRows) {
    try {
      const filePath = join(blogDir, `${row.slug}.md`);
      const existingFrontmatter = readExistingFrontmatter(filePath);
      const frontmatterLines = buildPostFrontmatter(row, existingFrontmatter);
      writeContentFile(filePath, frontmatterLines, row.body_md);
      const rel = `apps/static/src/content/blog/${row.slug}.md`;
      written.push(rel);
      console.log(`wrote ${rel}`);
      posts += 1;
    } catch (err) {
      console.error(`failed post ${row.slug}: ${err && err.message ? err.message : err}`);
    }
  }

  // Reconcile: remove .md for slugs no longer published. Safe because queryD1
  // throws on a failed query, so an empty result here means genuinely zero
  // published rows (not a transient error).
  const removed = [];
  pruneOrphans(programsDir, new Set(programRows.map((r) => r.slug)), 'programs', removed);
  pruneOrphans(blogDir, new Set(postRows.map((r) => r.slug)), 'blog', removed);

  // === LIST DATASETS (press, Hall of Fame, medalists) ===
  const datasets = materializeDatasets(written);
  for (const [name, n] of Object.entries(datasets)) {
    console.log(`wrote apps/static/src/content/data/${name === 'halloffame' ? 'halloffame' : name}.json (${n} rows)`);
  }

  return { programs, posts, datasets, written, removed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  materialize()
    .then((result) => {
      console.log(
        `materialize done: ${result.programs} programs, ${result.posts} posts, ` +
        `${result.datasets.press} press, ${result.datasets.halloffame} HoF photos, ` +
        `${result.datasets.medalists} medalists, ${result.datasets.team} team, ` +
        `${result.written.length} files written`,
      );
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
