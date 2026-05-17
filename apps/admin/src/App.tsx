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
import { NavShell } from './components/NavShell';

type Identity = { email: string; role: string };

export function App() {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const route = useRoute();

  // Once we have a token, fetch /api/admin/health to populate the topbar.
  // A 401 here means the token is dead — drop it and bounce to login.
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
    <NavShell currentRoute={route} userEmail={identity.email} onSignOut={signOut}>
      {renderPage(route)}
    </NavShell>
  );
}

function renderPage(route: string) {
  // /registrations/:id — detail view. Match before the literal /registrations.
  const regDetail = route.match(/^\/registrations\/([\w-]+)$/);
  if (regDetail) return <RegistrationDetail id={regDetail[1]} />;

  switch (route) {
    case '/':              return <Dashboard />;
    case '/registrations': return <Registrations />;
    case '/payments':      return <Payments />;
    case '/sponsorships':  return <Sponsorships />;
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
