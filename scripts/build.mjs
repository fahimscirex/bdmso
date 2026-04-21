import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const rootDir    = path.resolve(__dirname, "..");
const publicDir  = path.join(rootDir, "public");
const distDir    = path.join(rootDir, "dist");

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

cpSync(publicDir, distDir, { recursive: true });

const siteUrl = process.env.SITE_URL?.replace(/\/$/, "") || "http://localhost:8788";

writeFileSync(
  path.join(distDir, "robots.txt"),
  `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`,
  "utf8"
);

const pages = ["", "about", "blog", "media", "programs", "registration", "resources", "results", "sponsorship", "team"];
const now   = new Date().toISOString();

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(slug => `  <url><loc>${siteUrl}${slug ? `/${slug}` : ""}</loc><lastmod>${now}</lastmod></url>`).join("\n")}
</urlset>\n`;

writeFileSync(path.join(distDir, "sitemap.xml"), sitemap, "utf8");

const pkg = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"));
console.log(`Built ${pkg.name} → dist/`);
