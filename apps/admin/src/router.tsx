// Minimal pathname router, base-path aware - the app is served under /admin in
// production (Vite base), so routes are stored without the base and the base is
// added/stripped at the edges. pushState + popstate; <Link> intercepts clicks.

import { createContext, useContext, useEffect, useState, type ReactNode, type MouseEvent } from 'react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, ''); // '' or '/admin'
const strip = (p: string) => (BASE && p.startsWith(BASE) ? p.slice(BASE.length) || '/' : p || '/');
const full = (to: string) => `${BASE}${to}` || '/';

type RouterCtx = { path: string; navigate: (to: string) => void };
const Ctx = createContext<RouterCtx>({ path: '/', navigate: () => {} });

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(() => strip(window.location.pathname));

  useEffect(() => {
    const onPop = () => setPath(strip(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = (to: string) => {
    const target = full(to); // may include a ?query
    if (target === window.location.pathname + window.location.search) return;
    window.history.pushState({}, '', target);
    setPath(strip(to.split('?')[0])); // path matching is pathname-only; the query stays on the URL for pages to read
    window.scrollTo({ top: 0 });
  };

  return <Ctx.Provider value={{ path, navigate }}>{children}</Ctx.Provider>;
}

export const useRouter = () => useContext(Ctx);

type LinkProps = { href: string; className?: string; children: ReactNode; onNavigate?: () => void };
export function Link({ href, className, children, onNavigate }: LinkProps) {
  const { navigate } = useRouter();
  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    navigate(href);
    onNavigate?.();
  };
  return (
    <a href={full(href)} className={className} onClick={onClick}>
      {children}
    </a>
  );
}
