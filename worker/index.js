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
  handleCreatePayment, handlePaymentCallback,
  handleVerifyEmail, handleResendVerification,
} from "./routes/public.js";
import guardianRoutes from "./routes/guardian.js";
import adminRoutes from "./routes/admin.js";

// ─── API (Hono) ───────────────────────────────────────────────────────────────
//
// Three tiers:
//   /api/*           public (this file) — anyone can hit, may self-authenticate
//   /api/me/*        guardian (routes/guardian.js) — any authed role, mounted below
//   /api/admin/*     admin   (routes/admin.js)    — role-gated, mounted below
//
// Note: `GET /api/me` (exact match) is the existing public-tier dashboard
// payload (account + registrations). The guardian sub-app handles deeper
// paths like /api/me/profile. Hono's trie router routes the exact match
// first, so both coexist cleanly.

const api = new Hono().basePath("/api");

api.post("/login",                 (c) => handleLogin(c.req.raw, c.env));
api.post("/logout",                (c) => handleLogout(c.req.raw, c.env));
api.get ("/me",                    (c) => handleMe(c.req.raw, c.env));
api.post("/submit-registration",   (c) => handleRegistration(c.req.raw, c.env));
api.post("/add-enrollment",        (c) => handleAddEnrollment(c.req.raw, c.env));
api.get ("/validate-coupon",       (c) => handleValidateCoupon(c.req.raw, c.env, new URL(c.req.url)));
api.post("/submit-sponsorship",    (c) => handleSponsorship(c.req.raw, c.env));
api.post("/create-payment",        (c) => handleCreatePayment(c.req.raw, c.env));
api.all ("/payment-callback",      (c) => handlePaymentCallback(c.req.raw, c.env, new URL(c.req.url)));
api.get ("/verify-email",          (c) => handleVerifyEmail(c.req.raw, c.env, new URL(c.req.url)));
api.post("/resend-verification",   (c) => handleResendVerification(c.req.raw, c.env));

api.route("/me",    guardianRoutes);   // /api/me/profile, ...
api.route("/admin", adminRoutes);      // /api/admin/health, ...

// Intentional user-facing errors carry `.status` (from requireAuth, requireField,
// etc.) — surface as-is. Anything else is internal (D1 errors, bugs) → log + opaque
// 500 so we don't leak e.g. "D1_ERROR: no such table: login_attempts: SQLITE_ERROR".
api.onError((err, c) => {
  if (err.status) return c.json({ error: err.message }, err.status);
  console.log(`[api-error] ${c.req.method} ${c.req.path}:`, err?.stack || err?.message || err);
  return c.json({ error: "Something went wrong. Please try again." }, 500);
});

api.notFound((c) => c.json({ error: "Not found." }, 404));

// ─── Security Headers ─────────────────────────────────────────────────────────

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  "connect-src 'self'",
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
  { test: /\.(?:css|js|mjs)$/i,                                    value: "public, max-age=600, must-revalidate" },
  { test: /\.json$/i,                                              value: "public, max-age=300, must-revalidate" },
  { test: /\.html$/i,                                              value: "public, max-age=0, must-revalidate" },
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
function rewriteForAsset(pathname) {
  // /                         → /index.html
  if (pathname === "/") return "/index.html";
  // /about, /team etc.        → /about.html (only for known top-level pages)
  // /posts/<slug>             → /posts/<slug>.html
  // Anything whose last path segment already has a "." stays as-is (.css, .webp,
  // .webmanifest, .ico, .json, etc.).
  const lastSeg = pathname.slice(pathname.lastIndexOf("/") + 1);
  if (lastSeg.includes(".")) return pathname;
  return `${pathname}.html`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const response = await api.fetch(request, env);
      return withSecurityHeaders(response, url);
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
  }
};
