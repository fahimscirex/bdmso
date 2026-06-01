// Backfill the local D1 `programs` table from the committed Astro content files.
// For each apps/static/src/content/programs/*.md, the slug is the filename, the
// tagline comes from frontmatter, and the body is everything after the second
// `---`. Only `tagline` and `body_md` are touched - all other columns are left
// as they are. Local D1 only; never --remote.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const contentDir = join(repoRoot, 'apps', 'static', 'src', 'content', 'programs');
const sqlOutPath = '/tmp/backfill-programs.sql';

// NULL for null/empty, otherwise a single-quoted SQL string literal with inner
// single quotes doubled.
function q(value) {
  if (value === null || value === undefined || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

// Pull the `tagline` value out of the frontmatter block (the text between the
// first two lines that are exactly `---`). Strips one layer of surrounding
// single or double quotes.
function parseTagline(frontmatter) {
  for (const line of frontmatter.split('\n')) {
    const match = line.match(/^tagline:\s*(.*)$/);
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

function splitFrontmatter(text) {
  const lines = text.split('\n');
  if (lines[0].trim() !== '---') return { frontmatter: '', body: text.trim() };
  let second = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      second = i;
      break;
    }
  }
  if (second === -1) return { frontmatter: '', body: text.trim() };
  return {
    frontmatter: lines.slice(1, second).join('\n'),
    body: lines.slice(second + 1).join('\n').trim(),
  };
}

const files = readdirSync(contentDir).filter((f) => f.endsWith('.md'));

const statements = [];
for (const file of files) {
  const slug = file.replace(/\.md$/, '');
  const text = readFileSync(join(contentDir, file), 'utf8');
  const { frontmatter, body } = splitFrontmatter(text);
  const tagline = parseTagline(frontmatter);
  statements.push(
    `UPDATE programs SET tagline = ${q(tagline)}, body_md = ${q(body)} WHERE slug = ${q(slug)};`,
  );
}

const sql = ['BEGIN TRANSACTION;', ...statements, 'COMMIT;'].join('\n') + '\n';
writeFileSync(sqlOutPath, sql);

execFileSync(
  'pnpm',
  ['exec', 'wrangler', 'd1', 'execute', 'bdmso', '--local', `--file=${sqlOutPath}`],
  { cwd: repoRoot, stdio: 'inherit' },
);

console.log(`\nBackfilled ${statements.length} programs from ${contentDir}`);
