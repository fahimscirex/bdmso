import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { markdownToHtml, escHtml } from "../public/js/md.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const rootDir    = path.resolve(__dirname, "..");
const publicDir  = path.join(rootDir, "public");
const distDir    = path.join(rootDir, "dist");
const postsDir   = path.join(publicDir, "posts");

const SITE_URL = (process.env.SITE_URL?.replace(/\/$/, "") || "https://bdmso.org");
const seoData  = JSON.parse(readFileSync(path.join(publicDir, "seo.json"), "utf8"));

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function stripFrontmatter(raw) {
  const m = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
  return m ? m[1] : raw;
}

function escAttr(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function formatPostDate(str) {
  if (!str) return "";
  const d = new Date(str);
  if (isNaN(d)) return str;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

// ── Posts: generate index.json from frontmatter ──────────────────────────────

function readPosts() {
  return readdirSync(postsDir)
    .filter(f => f.endsWith(".md"))
    .sort()
    .map(file => {
      const raw  = readFileSync(path.join(postsDir, file), "utf8");
      const meta = parseFrontmatter(raw);
      if (!meta.slug || !meta.title) return null;
      return {
        file, raw,
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
}

function regeneratePosts() {
  const posts = readPosts();
  const slim = posts.map(({ file: _f, raw: _r, ...rest }) => rest);
  writeFileSync(
    path.join(postsDir, "index.json"),
    JSON.stringify(slim, null, 2) + "\n",
    "utf8"
  );
  console.log(`[posts] index.json regenerated (${slim.length} posts)`);
  // Also write per-post HTML and SEO files into public/ so wrangler dev (which
  // serves public/) can resolve /posts/<slug>, /robots.txt, /sitemap.xml.
  // The full build re-emits all of these into dist/.
  buildPostPages(posts, { target: "public" });
  writeRobotsAndSitemap(posts, { target: "public" });
  return posts;
}

regeneratePosts();
injectSeoIntoDir(publicDir);

// ── Watch mode ───────────────────────────────────────────────────────────────

if (process.argv.includes("--watch")) {
  let timer = null;
  watch(postsDir, (_event, filename) => {
    if (!filename || !filename.endsWith(".md")) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { regeneratePosts(); } catch (e) { console.error("[posts]", e.message); }
    }, 80);
  });
  console.log(`[posts] watching ${path.relative(rootDir, postsDir)} for changes…`);
  process.stdin.resume();
} else {
  buildDist();
}

// ── Per-post static HTML ─────────────────────────────────────────────────────

function buildPostPages(posts, { target = "dist" } = {}) {
  const template = readFileSync(path.join(publicDir, "post.html"), "utf8");
  const outDir   = target === "public"
    ? path.join(publicDir, "posts")
    : path.join(distDir, "posts");
  mkdirSync(outDir, { recursive: true });

  for (const post of posts) {
    const url    = `${SITE_URL}/posts/${post.slug}`;
    const image  = post.image
      ? (post.image.startsWith("http") ? post.image : `${SITE_URL}/${post.image.replace(/^\//, "")}`)
      : `${SITE_URL}/images/group-winner.webp`;

    const headInjection = [
      `<meta name="description" content="${escAttr(post.excerpt)}">`,
      `<link rel="canonical" href="${url}">`,
      `<meta name="theme-color" content="#0b1b3f">`,
      `<link rel="icon" href="/images/logo.webp" type="image/webp">`,
      `<link rel="apple-touch-icon" href="/images/logo.webp">`,
      `<meta property="og:type" content="article">`,
      `<meta property="og:site_name" content="BdMSO">`,
      `<meta property="og:locale" content="en_US">`,
      `<meta property="og:url" content="${url}">`,
      `<meta property="og:title" content="${escAttr(post.title)}">`,
      `<meta property="og:description" content="${escAttr(post.excerpt)}">`,
      `<meta property="og:image" content="${image}">`,
      `<meta property="article:published_time" content="${escAttr(post.date)}">`,
      `<meta property="article:author" content="${escAttr(post.author)}">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:title" content="${escAttr(post.title)}">`,
      `<meta name="twitter:description" content="${escAttr(post.excerpt)}">`,
      `<meta name="twitter:image" content="${image}">`,
      `<script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": post.title,
        "description": post.excerpt,
        "datePublished": post.date,
        "dateModified": post.date,
        "author": { "@type": "Person", "name": post.author },
        "image": image,
        "publisher": {
          "@type": "Organization",
          "name": "BdMSO",
          "logo": { "@type": "ImageObject", "url": `${SITE_URL}/images/logo.webp` }
        },
        "mainEntityOfPage": url
      })}</script>`,
    ].join("\n");

    const body     = stripFrontmatter(post.raw);
    const bodyHtml = markdownToHtml(body);

    const metaParts = [];
    if (post.category) metaParts.push(`<span class="eyebrow">${escHtml(post.category)}</span>`);
    if (post.date)     metaParts.push(`<span class="sep">·</span><span class="date">${escHtml(formatPostDate(post.date))}</span>`);
    if (post.author)   metaParts.push(`<span class="sep">·</span><span class="author">${escHtml(post.author)}</span>`);
    const metaBarHtml = metaParts.join(" ");

    const coverBlock = post.image
      ? `<div class="post-cover" id="post-cover">\n    <img loading="lazy" src="/${escAttr(post.image.replace(/^\//, ""))}" alt="${escAttr(post.title)}">\n  </div>`
      : `<div class="post-cover" id="post-cover" style="display:none;"></div>`;

    let html = template
      // post.html carries a noindex as a fallback for the unrendered shell;
      // generated /posts/<slug>.html pages are real content and MUST be indexable.
      .replace(/<meta\s+name="robots"\s+content="noindex,follow"\s*\/?>\s*\n?/i, "")
      .replace(/<title>[^<]*<\/title>/, `<title>${escAttr(post.title)} - BdMSO Blog</title>`)
      .replace("</head>", `${headInjection}\n</head>`)
      .replace(
        `<div id="post-meta-bar" class="post-meta-bar"></div>`,
        `<div id="post-meta-bar" class="post-meta-bar">${metaBarHtml}</div>`
      )
      .replace(
        `<h1 class="post-title" id="post-title">Loading…</h1>`,
        `<h1 class="post-title" id="post-title">${escHtml(post.title)}</h1>`
      )
      .replace(
        `<p class="post-excerpt" id="post-excerpt"></p>`,
        `<p class="post-excerpt" id="post-excerpt">${escHtml(post.excerpt)}</p>`
      )
      .replace(
        /<div class="post-cover" id="post-cover"[\s\S]*?<\/div>\s*<\/div>/,
        coverBlock
      )
      .replace(
        `<div class="post-body" id="post-body"></div>`,
        `<div class="post-body" id="post-body">${bodyHtml}</div>`
      )
      // The inline content loader is no longer needed — content is pre-rendered.
      .replace(/\n<script type="module">[\s\S]*?<\/script>/, "");

    writeFileSync(path.join(outDir, `${post.slug}.html`), html, "utf8");
  }
  console.log(`[posts] generated ${posts.length} static post page(s) in ${path.relative(rootDir, outDir)}/`);
}

// ── Full build ───────────────────────────────────────────────────────────────

function buildDist() {
  rmSync(distDir, { recursive: true, force: true });
  mkdirSync(distDir, { recursive: true });

  cpSync(publicDir, distDir, { recursive: true });

  const posts = readPosts();
  buildPostPages(posts);
  buildBlogIndex(posts);
  injectSeoIntoDir(distDir);
  const { count } = writeRobotsAndSitemap(posts, { target: "dist" });

  const pkg = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"));
  console.log(`Built ${pkg.name} → dist/ (${count} sitemap entries)`);
}

// ── SEO injection from seo.json ───────────────────────────────────────────────

function injectSeoIntoDir(targetDir) {
  const files = readdirSync(targetDir).filter(f => f.endsWith(".html"));
  for (const file of files) {
    const filePath = path.join(targetDir, file);
    let html = readFileSync(filePath, "utf8");
    if (!html.includes("<!-- SEO_BLOCK -->")) continue;

    const pagePath = file === "index.html" ? "/" : `/${file.replace(/\.html$/, "")}`;
    const page = seoData[pagePath];
    if (!page) continue;

    const seoBlock = buildSeoBlock(page, pagePath);
    html = html.replace("<!-- SEO_BLOCK -->", seoBlock);
    writeFileSync(filePath, html, "utf8");
  }

  // Also handle posts/ directory if it exists
  const postsOutDir = path.join(targetDir, "posts");
  let postsFiles;
  try { postsFiles = readdirSync(postsOutDir).filter(f => f.endsWith(".html")); } catch { postsFiles = []; }
  for (const file of postsFiles) {
    const filePath = path.join(postsOutDir, file);
    let html = readFileSync(filePath, "utf8");
    if (!html.includes("<!-- SEO_BLOCK -->")) continue;

    const pagePath = `/posts/${file.replace(/\.html$/, "")}`;
    const page = seoData[pagePath];
    if (!page) continue;

    const seoBlock = buildSeoBlock(page, pagePath);
    html = html.replace("<!-- SEO_BLOCK -->", seoBlock);
    writeFileSync(filePath, html, "utf8");
  }
}

function buildSeoBlock(page, pagePath) {
  const canon = `${SITE_URL}${pagePath}`;
  const img   = page.image
    ? (page.image.startsWith("http") ? page.image : `${SITE_URL}${page.image.startsWith("/") ? page.image : `/${page.image}`}`)
    : `${SITE_URL}/images/logo.webp`;

  const lines = [];
  if (page.title) lines.push(`<title>${escAttr(page.title)}</title>`);
  if (page.description) lines.push(`<meta name="description" content="${escAttr(page.description)}">`);
  lines.push(`<link rel="canonical" href="${canon}">`);
  if (page.robots) lines.push(`<meta name="robots" content="${page.robots}">`);

  // Open Graph
  if (page.title || page.description) {
    lines.push(`<meta property="og:type" content="website">`);
    lines.push(`<meta property="og:site_name" content="BdMSO">`);
    lines.push(`<meta property="og:locale" content="en_US">`);
    lines.push(`<meta property="og:url" content="${canon}">`);
    if (page.title) lines.push(`<meta property="og:title" content="${escAttr(page.title)}">`);
    if (page.description) lines.push(`<meta property="og:description" content="${escAttr(page.description)}">`);
    lines.push(`<meta property="og:image" content="${img}">`);
    lines.push(`<meta property="og:image:width" content="1200">`);
    lines.push(`<meta property="og:image:height" content="630">`);
    lines.push(`<meta name="twitter:card" content="summary_large_image">`);
    if (page.title) lines.push(`<meta name="twitter:title" content="${escAttr(page.title)}">`);
    if (page.description) lines.push(`<meta name="twitter:description" content="${escAttr(page.description)}">`);
    lines.push(`<meta name="twitter:image" content="${img}">`);
  }

  // Schema
  const schemas = Array.isArray(page.schema) ? page.schema : (page.schema ? [page.schema] : []);
  for (const s of schemas) {
    lines.push(`<script type="application/ld+json">${JSON.stringify(s)}</script>`);
  }

  return lines.join("\n");
}
//
// public/blog.html stays as the template (with placeholder markup that the
// inline script hydrates). We overwrite dist/blog.html with a server-rendered
// version so non-rendering crawlers still see post links and titles.

function buildBlogIndex(posts) {
  const template = readFileSync(path.join(publicDir, "blog.html"), "utf8");

  const formatDateShort = (str) => {
    if (!str) return "";
    const d = new Date(str);
    return isNaN(d) ? str : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };

  const cats = ["all", ...new Set(posts.map(p => p.category).filter(Boolean))];
  const catsHtml = cats.map(c =>
    `<button data-cat="${escAttr(c)}" class="${c === 'all' ? 'active' : ''}">${c === 'all' ? 'All' : escHtml(c)}</button>`
  ).join("");

  const featured = posts.find(p => p.featured);
  const rest     = posts.filter(p => !p.featured);

  const cover = (p, ph) => p.image
    ? `<img loading="lazy" src="/${escAttr(p.image.replace(/^\//, ""))}" alt="${escAttr(p.title)}">`
    : `<div class="ph">[${escHtml(ph)}]</div>`;

  const featureHtml = featured ? `<a class="feature" href="/posts/${escAttr(featured.slug)}">
      <div class="cover">${cover(featured, 'cover')}</div>
      <div class="body">
        <div class="meta"><span class="cat">${escHtml(featured.category)}</span><span>${escHtml(formatDateShort(featured.date))}</span></div>
        <h2>${escHtml(featured.title)}</h2>
        <p>${escHtml(featured.excerpt)}</p>
        <span class="read">Read more →</span>
      </div>
    </a>` : "";

  const gridHtml = rest.length
    ? rest.map(p => `<a class="post" href="/posts/${escAttr(p.slug)}">
      <div class="cover">${cover(p, p.category)}</div>
      <div class="body">
        <div class="meta"><span class="cat">${escHtml(p.category)}</span><span>${escHtml(formatDateShort(p.date))}</span></div>
        <h3>${escHtml(p.title)}</h3>
        <p>${escHtml(p.excerpt)}</p>
        <span class="read">Read →</span>
      </div>
    </a>`).join("")
    : `<p style="color:var(--ink-3);padding:32px 0;">No posts yet.</p>`;

  const html = template
    .replace(
      /<div class="cats" id="cats-bar">[\s\S]*?<\/div>/,
      `<div class="cats" id="cats-bar">${catsHtml}</div>`
    )
    .replace(
      `<div id="feature-post"></div>`,
      `<div id="feature-post">${featureHtml}</div>`
    )
    .replace(
      `<div class="posts" id="posts-grid"><div class="posts-loading">Loading posts…</div></div>`,
      `<div class="posts" id="posts-grid">${gridHtml}</div>`
    );

  writeFileSync(path.join(distDir, "blog.html"), html, "utf8");
  console.log(`[blog] pre-rendered dist/blog.html (${posts.length} posts)`);
}

// ── robots.txt + sitemap.xml ─────────────────────────────────────────────────

function writeRobotsAndSitemap(posts, { target = "dist" } = {}) {
  const outDir = target === "public" ? publicDir : distDir;

  writeFileSync(
    path.join(outDir, "robots.txt"),
    [
      "User-agent: *",
      "Allow: /",
      // /dashboard and /login carry <meta name="robots" content="noindex,follow">
      // — they intentionally remain crawlable so Google can read the noindex.
      "Disallow: /posts/index.json",
      "",
      `Sitemap: ${SITE_URL}/sitemap.xml`,
      "",
    ].join("\n"),
    "utf8"
  );

  const staticPages = [
    { slug: "",             priority: "1.0", changefreq: "weekly" },
    { slug: "registration", priority: "0.95", changefreq: "weekly" },
    { slug: "programs",     priority: "0.9",  changefreq: "monthly" },
    { slug: "programs/maryam-mirzakhani-school", priority: "0.85", changefreq: "monthly" },
    { slug: "results",      priority: "0.85", changefreq: "monthly" },
    { slug: "team",         priority: "0.8",  changefreq: "monthly" },
    { slug: "resources",    priority: "0.8",  changefreq: "monthly" },
    { slug: "about",        priority: "0.75", changefreq: "monthly" },
    { slug: "blog",         priority: "0.75", changefreq: "weekly" },
    { slug: "media",        priority: "0.6",  changefreq: "monthly" },
    { slug: "sponsorship",  priority: "0.6",  changefreq: "monthly" },
  ];
  const now = new Date().toISOString();
  const pageMtime = (slug) => {
    const filename = slug ? `${slug}.html` : "index.html";
    try { return statSync(path.join(publicDir, filename)).mtime.toISOString(); }
    catch { return now; }
  };

  const urls = [
    ...staticPages.map(p => ({
      loc: `${SITE_URL}${p.slug ? `/${p.slug}` : "/"}`,
      lastmod: pageMtime(p.slug),
      changefreq: p.changefreq,
      priority: p.priority,
    })),
    ...posts.map(post => ({
      loc: `${SITE_URL}/posts/${post.slug}`,
      lastmod: post.date ? new Date(post.date).toISOString() : now,
      changefreq: "monthly",
      priority: "0.7",
    })),
  ];

  const sitemap =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u =>
      `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`
    ).join("\n") +
    `\n</urlset>\n`;

  writeFileSync(path.join(outDir, "sitemap.xml"), sitemap, "utf8");
  return { count: urls.length };
}
