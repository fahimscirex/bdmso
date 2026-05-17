// Path-based router. Same pattern as the admin SPA, just bound to the
// /dashboard prefix.

import { useEffect, useState } from 'preact/hooks';

const PREFIX = '/dashboard';

function normalize(pathname: string): string {
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

export function href(to: string): string {
  return PREFIX + (to === '/' ? '' : to);
}
