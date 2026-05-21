// Minimal path-based router. No deps - we only have a handful of routes for now.
// Switch to preact-iso (official Preact router) once routes pass ~10 or we
// need nested layouts.
//
// All admin routes live under /admin/* (Worker rewrites /admin/whatever →
// /admin/index.html, so the SPA owns these URLs).

import { useEffect, useState } from 'preact/hooks';

const PREFIX = '/admin';

function normalize(pathname: string): string {
  // Strip the /admin prefix so route matching uses bare paths like /, /registrations.
  if (pathname === PREFIX || pathname === PREFIX + '/') return '/';
  if (pathname.startsWith(PREFIX + '/')) return pathname.slice(PREFIX.length);
  return pathname;
}

export function useRoute(): string {
  const [route, setRoute] = useState(() => normalize(location.pathname));
  useEffect(() => {
    const onChange = () => setRoute(normalize(location.pathname));
    window.addEventListener('popstate', onChange);
    return () => window.removeEventListener('popstate', onChange);
  }, []);
  return route;
}

export function navigate(to: string): void {
  const full = to.startsWith('/') ? PREFIX + (to === '/' ? '' : to) : to;
  history.pushState(null, '', full);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/**
 * Build the public URL for a route - useful for <a href> so middle-click
 * and right-click → copy-link work properly. Pair with onClick={(e) => {
 * e.preventDefault(); navigate(to); }} to keep SPA navigation on left-click.
 */
export function href(to: string): string {
  return PREFIX + (to === '/' ? '' : to);
}
