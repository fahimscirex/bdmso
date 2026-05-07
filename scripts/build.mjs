import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const rootDir    = path.resolve(__dirname, "..");
const publicDir  = path.join(rootDir, "public");
const distDir    = path.join(rootDir, "dist");
const postsDir   = path.join(publicDir, "posts");

// ── Generate posts/index.json from frontmatter ────────────────────────────────

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim().replace(/^["']|["']$/g, '');
    meta[key] = val;
  }
  return meta;
}

function generateIndex() {
  const mdFiles = readdirSync(postsDir).filter(f => f.endsWith(".md")).sort();
  const postIndex = mdFiles
    .map(file => {
      const raw  = readFileSync(path.join(postsDir, file), "utf8");
      const meta = parseFrontmatter(raw);
      if (!meta.slug || !meta.title) return null;
      return {
        slug:     meta.slug,
        title:    meta.title,
        category: meta.category || "",
        date:     meta.date     || "",
        author:   meta.author   || "",
        excerpt:  meta.excerpt  || "",
        image:    meta.image    || "",
        featured: meta.featured === "true",
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.date > a.date ? 1 : -1));

  writeFileSync(
    path.join(postsDir, "index.json"),
    JSON.stringify(postIndex, null, 2) + "\n",
    "utf8"
  );
  console.log(`[posts] index.json regenerated (${postIndex.length} posts)`);
}

generateIndex();

// ── Watch mode: re-generate index.json when .md files change ─────────────────

if (process.argv.includes("--watch")) {
  let timer = null;
  watch(postsDir, (_event, filename) => {
    if (!filename || !filename.endsWith(".md")) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { generateIndex(); } catch (e) { console.error("[posts]", e.message); }
    }, 80);
  });
  console.log(`[posts] watching ${path.relative(rootDir, postsDir)} for changes…`);
  process.stdin.resume();
} else {
  buildDist();
}

function buildDist() {
  rmSync(distDir, { recursive: true, force: true });
  mkdirSync(distDir, { recursive: true });

  cpSync(publicDir, distDir, { recursive: true });

  const siteUrl = process.env.SITE_URL?.replace(/\/$/, "") || "http://localhost:8788";

  writeFileSync(
    path.join(distDir, "robots.txt"),
    `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`,
    "utf8"
  );

  const pages = ["", "about", "blog", "dashboard", "login", "media", "programs", "registration", "resources", "results", "sponsorship", "team"];
  const now   = new Date().toISOString();

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(slug => `  <url><loc>${siteUrl}${slug ? `/${slug}` : ""}</loc><lastmod>${now}</lastmod></url>`).join("\n")}
</urlset>\n`;

  writeFileSync(path.join(distDir, "sitemap.xml"), sitemap, "utf8");

  const pkg = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"));
  console.log(`Built ${pkg.name} → dist/`);
}
