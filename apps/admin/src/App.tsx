// Top-level: auth gate + route switch. Two-state UI:
//   1. No token → show Login. On success, save token + re-render.
//   2. Token   → show NavShell with the right page for the current URL.
//
// Sign-out (or any 401 from the API client) clears the token, dropping back
// to state 1.

import { useEffect, useState } from 'preact/hooks';
import { getToken, clearToken } from './auth';
import { useRoute } from './router';
import { api, ApiError } from './api';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Registrations } from './pages/Registrations';
import { RegistrationDetail } from './pages/RegistrationDetail';
import { Payments } from './pages/Payments';
import { Sponsorships } from './pages/Sponsorships';
import { AuditLog } from './pages/AuditLog';
import { Users } from './pages/Users';
import { Settings } from './pages/Settings';
import { Coupons } from './pages/Coupons';
import { Broadcast } from './pages/Broadcast';
import { Posts } from './pages/Posts';
import { PostEditor } from './pages/PostEditor';
import { Programs } from './pages/Programs';
import { ProgramEditor } from './pages/ProgramEditor';
import { Triage } from './pages/Triage';
import { PaymentReports } from './pages/PaymentReports';
import { Events } from './pages/Events';
import { CommandPalette } from './components/CommandPalette';
import { NavShell } from './components/NavShell';

type Identity = { email: string; role: string };

export function App() {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const route = useRoute();

  // Global keyboard shortcuts.
  //   Cmd+K / Ctrl+K  - toggle command palette
  //   /               - same (when not in an input/textarea)
  //   ?               - same (cheap "show shortcuts" until we have a help page)
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const isModK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      const target = e.target as HTMLElement | null;
      const inField = target && /^(input|textarea|select)$/i.test(target.tagName);
      if (isModK) { e.preventDefault(); setPaletteOpen((o) => !o); return; }
      if (!inField && (e.key === '/' || e.key === '?')) { e.preventDefault(); setPaletteOpen(true); }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Once we have a token, fetch /api/admin/health to populate the topbar.
  // A 401 here means the token is dead - drop it and bounce to login.
  useEffect(() => {
    if (!token) { setIdentity(null); return; }
    api.get<{ email: string; role: string }>('/api/admin/health')
      .then((d) => setIdentity({ email: d.email, role: d.role }))
      .catch((err: ApiError) => {
        if (err.status === 401) signOut();
        else setIdentityError(err.message);
      });
  }, [token]);

  function onSignedIn() {
    setTokenState(getToken());
    setIdentityError(null);
  }

  function signOut() {
    clearToken();
    setTokenState(null);
    setIdentity(null);
  }

  if (!token) return <Login onSignedIn={onSignedIn} />;

  if (identityError) {
    return (
      <main class="shell">
        <div class="card">
          <h2>Couldn't reach the admin API</h2>
          <p class="error">{identityError}</p>
          <button onClick={signOut}>Sign out</button>
        </div>
      </main>
    );
  }

  if (!identity) {
    return <main class="shell"><div class="muted">Loading…</div></main>;
  }

  return (
    <>
      <NavShell currentRoute={route} onSignOut={signOut}>
        {renderPage(route)}
      </NavShell>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}

function renderPage(route: string) {
  // /registrations/:id - detail view.
  const regDetail = route.match(/^\/registrations\/([\w-]+)$/);
  if (regDetail) return <RegistrationDetail id={regDetail[1]} />;

  // /posts/new and /posts/<slug>/edit - the editor handles both.
  const postEdit = route.match(/^\/posts\/([a-z0-9][a-z0-9-]*)\/edit$/);
  if (postEdit) return <PostEditor slug={postEdit[1]} />;
  if (route === '/posts/new') return <PostEditor slug="new" />;

  // /programs/new and /programs/<slug>/edit - the editor handles both.
  const progEdit = route.match(/^\/programs\/([a-z0-9][a-z0-9-]*)\/edit$/);
  if (progEdit) return <ProgramEditor slug={progEdit[1]} />;
  if (route === '/programs/new') return <ProgramEditor slug="new" />;

  switch (route) {
    case '/':              return <Dashboard />;
    case '/triage':        return <Triage />;
    case '/registrations': return <Registrations />;
    case '/payments':         return <Payments />;
    case '/payments/reports': return <PaymentReports />;
    case '/sponsorships':  return <Sponsorships />;
    case '/coupons':       return <Coupons />;
    case '/broadcast':     return <Broadcast />;
    case '/events':        return <Events />;
    case '/posts':         return <Posts />;
    case '/programs':      return <Programs />;
    case '/users':         return <Users />;
    case '/audit':         return <AuditLog />;
    case '/settings':      return <Settings />;
    default:               return <NotFound route={route} />;
  }
}

function NotFound({ route }: { route: string }) {
  return (
    <>
      <div class="page-header">
        <h1>Page not found</h1>
        <p class="sub">No route matches <code>{route}</code>. Try the sidebar.</p>
      </div>
    </>
  );
}
