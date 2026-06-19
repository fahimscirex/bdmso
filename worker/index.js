// Worker entry point. The Hono app at /api/* dispatches to route modules in
// worker/routes/, with helpers in worker/lib/. The non-API paths (static
// assets, pretty redirects, security/cache headers) are handled inline below.
//
// Adding a new public endpoint?  Implement it in worker/routes/public.js and
// register the route on the `api` Hono instance below.
//
// Adding a guardian-only or admin-only endpoint?  Wait for Sprint 0c part 2:
// worker/middleware/{session,requireRole}.js + routes/{guardian,admin}.js.

import { Hono } from "hono";
import {
  handleLogin, handleLogout, handleMe,
  handleRegistration, handleAddEnrollment, handleValidateCoupon,
  handleSponsorship,
  handleCreatePayment, handlePaymentCallback, handleInvoice,
  handleVerifyEmail, handleResendVerification,
  handleForgotPassword, handleForgotEmail, handleResetPassword,
  handleCatalog,
} from "./routes/public.js";
import guardianRoutes from "./routes/guardian.js";
import adminRoutes from "./routes/admin.js";
import { readRepoAsset, repoRelForLogical } from "./lib/repoAssets.js";

// ─── API (Hono) ───────────────────────────────────────────────────────────────
//
// Three tiers:
//   /api/*           public (this file) - anyone can hit, may self-authenticate
//   /api/me/*        guardian (routes/guardian.js) - any authed role, mounted below
//   /api/admin/*     admin   (routes/admin.js)    - role-gated, mounted below
//
// Note: `GET /api/me` (exact match) is the existing public-tier dashboard
// payload (account + registrations). The guardian sub-app handles deeper
// paths like /api/me/profile. Hono's trie router routes the exact match
// first, so both coexist cleanly.

const api = new Hono().basePath("/api");

api.post("/login",                 (c) => handleLogin(c.req.raw, c.env));
api.post("/logout",                (c) => handleLogout(c.req.raw, c.env));
api.get ("/me",                    (c) => handleMe(c.req.raw, c.env));
api.get ("/catalog",               (c) => handleCatalog(c.req.raw, c.env));
api.post("/submit-registration",   (c) => handleRegistration(c.req.raw, c.env));
api.post("/add-enrollment",        (c) => handleAddEnrollment(c.req.raw, c.env));
api.get ("/validate-coupon",       (c) => handleValidateCoupon(c.req.raw, c.env, new URL(c.req.url)));
api.post("/submit-sponsorship",    (c) => handleSponsorship(c.req.raw, c.env));
api.post("/create-payment",        (c) => handleCreatePayment(c.req.raw, c.env));
api.all ("/payment-callback",      (c) => handlePaymentCallback(c.req.raw, c.env, new URL(c.req.url)));
api.get ("/invoice/:registrationId", (c) => handleInvoice(c.req.raw, c.env, new URL(c.req.url), c.req.param("registrationId")));
api.get ("/verify-email",          (c) => handleVerifyEmail(c.req.raw, c.env, new URL(c.req.url)));
api.post("/resend-verification",   (c) => handleResendVerification(c.req.raw, c.env));
api.post("/forgot-password",       (c) => handleForgotPassword(c.req.raw, c.env));
api.post("/forgot-email",          (c) => handleForgotEmail(c.req.raw, c.env));
api.post("/reset-password",        (c) => handleResetPassword(c.req.raw, c.env));

api.route("/me",    guardianRoutes);   // /api/me/profile, ...
api.route("/admin", adminRoutes);      // /api/admin/health, ...

// Intentional user-facing errors carry `.status` (from requireAuth, requireField,
// etc.) - surface as-is. Anything else is internal (D1 errors, bugs) → log + opaque
// 500 so we don't leak e.g. "D1_ERROR: no such table: login_attempts: SQLITE_ERROR".
api.onError((err, c) => {
  if (err.status) return c.json({ error: err.message }, err.status);
  console.log(`[api-error] ${c.req.method} ${c.req.path}:`, err?.message || err);
  return c.json({ error: "Something went wrong. Please try again." }, 500);
});

api.notFound((c) => c.json({ error: "Not found." }, 404));

// ─── Admin image preview (/admin-img/<logical path>) ──────────────────────────
//
// Images live in the repo (apps/static/src/assets) and the public site serves
// optimized _astro variants. The admin SPA, however, previews images by their
// stored logical path (/images/..., /assets/uploads/...). This route serves
// those originals straight from the repo source (GitHub raw in prod, the dev
// sidecar locally) so dashboard thumbnails/previews work without R2 or a
// duplicated public/images. See worker/lib/repoAssets.js.

async function serveAdminImg(request, env, url) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }
  const logical = decodeURIComponent(url.pathname.slice("/admin-img/".length));
  const repoRel = repoRelForLogical(logical);
  if (!repoRel) return new Response("Bad path", { status: 400 });
  const res = await readRepoAsset(env, repoRel);
  return res || new Response("Not found", { status: 404 });
}

// ─── Security Headers ─────────────────────────────────────────────────────────

const CSP = [
  "default-src 'self'",
  // static.cloudflareinsights.com - Cloudflare Web Analytics beacon.
  // Zaraz loads its own scripts first-party via /cdn-cgi/zaraz/ so no
  // extra script-src host is needed for it.
  "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  // connect-src:
  //   cloudflareinsights.com - CF Web Analytics POST target
  //   google-analytics.com + analytics.google.com - Zaraz forwards
  //     these GA4 client-side beacons through the browser
  //   stats.g.doubleclick.net - GA4 Google Signals (cross-device)
  "connect-src 'self' https://cloudflareinsights.com https://www.google-analytics.com https://*.analytics.google.com https://*.google-analytics.com https://stats.g.doubleclick.net",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

function withSecurityHeaders(response, url) {
  // ASSETS.fetch() returns an immutable response - clone to mutate headers.
  const res = new Response(response.body, response);
  // HSTS only on real domains - localhost would get stuck refusing http:// in future dev sessions.
  if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.headers.set("Content-Security-Policy", CSP);
  return res;
}

// ─── Cache-Control by content type ────────────────────────────────────────────

const CACHE_RULES = [
  { test: /\.(?:webp|png|jpe?g|gif|svg|ico|woff2?|ttf|otf|eot)$/i, value: "public, max-age=31536000, immutable" },
  // Vite-built SPA bundles carry a content hash in the filename
  // (dist/<app>/assets/index-<hash>.js), so they're safe to cache forever.
  { test: /\/assets\/.*\.(?:css|js)$/i,                            value: "public, max-age=31536000, immutable" },
  // Hand-written /js and /css use stable, unhashed filenames - they must
  // revalidate on every load, otherwise a deploy serves stale script
  // against fresh HTML (e.g. new markup with old JS that never runs).
  { test: /\.(?:css|js|mjs)$/i,                                    value: "public, max-age=0, must-revalidate" },
  { test: /\.json$/i,                                              value: "public, max-age=300, must-revalidate" },
  // HTML: never edge-cache. `s-maxage=0` tells Cloudflare's edge cache
  // to skip caching entirely; browsers still cache for 0s then
  // revalidate. Catches `.html`, extensionless URLs (`/about`), and the
  // root `/` so a deploy is visible at the edge immediately.
  { test: /\.html$/i,                                              value: "public, max-age=0, s-maxage=0, must-revalidate" },
  { test: /\/$/,                                                   value: "public, max-age=0, s-maxage=0, must-revalidate" },
  { test: /\/[^.]+$/,                                              value: "public, max-age=0, s-maxage=0, must-revalidate" },
];

function applyCacheHeaders(response, pathname) {
  const rule = CACHE_RULES.find(r => r.test.test(pathname));
  if (!rule) return response;
  const res = new Response(response.body, response);
  res.headers.set("Cache-Control", rule.value);
  return res;
}

// ─── Pretty-URL redirects (301) ───────────────────────────────────────────────

function tryPrettyRedirect(url) {
  let pathname = url.pathname;

  // Legacy flat sitemap (the build.mjs era served /sitemap.xml) → the
  // @astrojs/sitemap index, so previously-submitted /sitemap.xml keeps working.
  if (pathname === "/sitemap.xml") {
    return Response.redirect(new URL("/sitemap-index.xml", url).toString(), 301);
  }

  // /post?slug=foo  →  /posts/foo  (and /post with no slug → /blog)
  if (pathname === "/post" || pathname === "/post.html") {
    const slug = url.searchParams.get("slug");
    if (slug) {
      const target = new URL(`/posts/${encodeURIComponent(slug)}`, url);
      return Response.redirect(target.toString(), 301);
    }
    return Response.redirect(new URL("/blog", url).toString(), 301);
  }

  // /<page>.html  →  /<page>  (except blog post static files served at /posts/<slug>.html
  //  which we don't want to expose with .html either - both 301 to extensionless)
  if (pathname.endsWith(".html") && pathname !== "/index.html") {
    const target = new URL(pathname.slice(0, -5) + url.search, url);
    return Response.redirect(target.toString(), 301);
  }
  if (pathname === "/index.html") {
    return Response.redirect(new URL("/" + url.search, url).toString(), 301);
  }

  // Trailing slash on non-root  →  no slash
  if (pathname.length > 1 && pathname.endsWith("/")) {
    const target = new URL(pathname.slice(0, -1) + url.search, url);
    return Response.redirect(target.toString(), 301);
  }

  return null;
}

// With html_handling = "none" the assets binding doesn't auto-add .html or
// redirect /foo.html → /foo. The worker is solely responsible for URL routing.
//
// Dashboard SPA paths (/dashboard/*, /admin/*) are an exception: the Vite
// builds emit a single index.html + hashed assets under dist/<app>/, and the
// SPA owns its own client-side routing. Any extensionless path inside those
// prefixes serves the app's index.html so deep links work after refresh.
const SPA_PREFIXES = ["/dashboard", "/admin"];

function rewriteForAsset(pathname) {
  if (pathname === "/") return "/index.html";

  // SPA fallback: /dashboard, /dashboard/foo, /admin/anything/deep → app index.
  // Hashed assets like /dashboard/assets/index-K6O-itQ-.js still pass through
  // because they have a dot in the last segment.
  for (const app of SPA_PREFIXES) {
    if (pathname === app || pathname.startsWith(`${app}/`)) {
      const lastSeg = pathname.slice(pathname.lastIndexOf("/") + 1);
      if (!lastSeg.includes(".")) return `${app}/index.html`;
      return pathname;
    }
  }

  // /about, /team etc.        → /about.html (only for known top-level pages)
  // /posts/<slug>             → /posts/<slug>.html
  // Anything whose last path segment already has a "." stays as-is (.css, .webp,
  // .webmanifest, .ico, .json, etc.).
  const lastSeg = pathname.slice(pathname.lastIndexOf("/") + 1);
  if (lastSeg.includes(".")) return pathname;
  return `${pathname}.html`;
}

// Temporary maintenance mode. Flip MAINTENANCE="true" (dashboard var) to show
// the public a "back soon" page during a deploy/cutover. /admin + /api/admin
// stay open so you can keep working, and visiting any page with
// ?preview=<MAINTENANCE_KEY> drops a bypass cookie so you can smoke-test the
// live stack while the public still sees the page. Returns a Response to short-
// circuit, or null to let the request through.
const MAINTENANCE_HTML = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>BdMSO — Back soon</title><style>
:root{color-scheme:light dark}body{margin:0;min-height:100dvh;display:grid;place-items:center;
font:16px/1.6 system-ui,sans-serif;background:#0b1020;color:#e7ebf5;text-align:center;padding:2rem}
.card{max-width:32rem}h1{font-size:1.6rem;margin:0 0 .5rem}p{opacity:.8;margin:.25rem 0}
.dot{display:inline-block;width:.5rem;height:.5rem;border-radius:50%;background:#5b8cff;margin-right:.4rem}
</style></head><body><div class="card"><h1><span class="dot"></span>We'll be right back</h1>
<p>BdMSO is undergoing a short scheduled upgrade.</p>
<p>Please check back in a few minutes. Existing registrations and payments are safe.</p></div></body></html>`;

function maintenanceGate(request, url, env) {
  // Admin app + API stay reachable so operators can keep working.
  if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/api/admin")) return null;
  const key = env.MAINTENANCE_KEY || "";
  const cookie = request.headers.get("cookie") || "";
  if (key && cookie.includes(`bdmso_preview=${key}`)) return null;
  // ?preview=<key> sets the bypass cookie, then redirects to the clean URL.
  if (key && url.searchParams.get("preview") === key) {
    return new Response(null, { status: 302, headers: {
      location: url.origin + url.pathname,
      "set-cookie": `bdmso_preview=${key}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`,
    } });
  }
  return new Response(MAINTENANCE_HTML, { status: 503, headers: {
    "content-type": "text/html; charset=utf-8",
    "retry-after": "3600",
    "cache-control": "no-store",
  } });
}

export default {
  // Cron-triggered reconciliation: catches pending payments that fell
  // through the cracks (browser redirect broke, IPN never arrived, callback
  // threw an error).  Configured in wrangler.toml:
  //   [env.production.triggers]
  //   crons = ["*/30 * * * *"]
  async scheduled(event, env) {
    // Top-level guard: a throw here (failed import, DB error in the pre-loop
    // query) would otherwise surface only as an opaque cron failure. Catch and
    // log so the schedule keeps running and the cause is visible in `tail`.
    try {
      const { reconcileStalePayments } = await import("./lib/reconcile.js");
      // PRODUCTION_DOMAIN: canonical host (set as a Worker var/secret in wrangler.toml),
      // used to build callback/IPN base URLs when reconciling stale payments off-request.
      const baseUrl = `https://${env.PRODUCTION_DOMAIN || "bdmso.org"}`;
      const result = await reconcileStalePayments(env, baseUrl);
      console.log(`[reconcile-cron] checked=${result.checked} paid=${result.paid} failed=${result.failed} errors=${result.errors.length}`);
    } catch (err) {
      console.log("[reconcile-cron] fatal:", err?.stack || err?.message || err);
    }
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    if (env.MAINTENANCE === "true") {
      const blocked = maintenanceGate(request, url, env);
      if (blocked) return blocked;
    }

    try {
      if (url.pathname.startsWith("/api/")) {
        const response = await api.fetch(request, env);
        return withSecurityHeaders(response, url);
      }

      // Admin image previews: serve repo-source originals for the dashboard.
      if (url.pathname.startsWith("/admin-img/")) {
        const img = await serveAdminImg(request, env, url);
        return withSecurityHeaders(img, url);
      }

      // /.well-known/change-password -> the account area where a signed-in
      // guardian manages their password. 302 per the W3C change-password URL
      // spec; deliberately NOT the forgot-password reset flow.
      if (url.pathname === "/.well-known/change-password") {
        return withSecurityHeaders(
          new Response(null, { status: 302, headers: { Location: "/dashboard" } }),
          url,
        );
      }

      // Pretty-URL canonicalization with 301s (replaces the assets binding's default 307s).
      if (request.method === "GET" || request.method === "HEAD") {
        const redirect = tryPrettyRedirect(url);
        if (redirect) return withSecurityHeaders(redirect, url);
      }

      // Map extensionless URL → underlying .html asset (no redirect; transparent rewrite).
      const assetPath = rewriteForAsset(url.pathname);
      let assetRequest = request;
      if (assetPath !== url.pathname) {
        const rewritten = new URL(request.url);
        rewritten.pathname = assetPath;
        assetRequest = new Request(rewritten.toString(), request);
      }

      const response = await env.ASSETS.fetch(assetRequest);
      const cached = applyCacheHeaders(response, url.pathname);
      return withSecurityHeaders(cached, url);
    } catch (err) {
      // Custom 500: serve the built /500.html with the correct status code so a
      // crash never leaks a stack trace or a soft-200 error page.
      console.error("worker error:", err && err.message ? err.message : err);
      try {
        const page = await env.ASSETS.fetch(new Request(new URL("/500.html", url.origin)));
        const body = page.ok ? await page.text() : "<!doctype html><h1>500 - Something went wrong</h1>";
        return withSecurityHeaders(
          new Response(body, { status: 500, headers: { "content-type": "text/html; charset=utf-8" } }),
          url,
        );
      } catch {
        return withSecurityHeaders(new Response("Internal Server Error", { status: 500 }), url);
      }
    }
  }
};

// Posts are served statically from the Astro build (dist/posts/<slug>.html),
// materialized from the `posts` table - same model as programs/press/team. The
// old runtime D1 renderer (serveD1Post) was removed so post images go through
// Astro's image optimizer like every other page.
