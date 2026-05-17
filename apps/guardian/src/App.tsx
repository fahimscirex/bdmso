// Top-level: auth gate + route switch. Same pattern as the admin SPA
// but bound to the guardian token and the /dashboard prefix.

import { useEffect, useState } from 'preact/hooks';
import { getToken, clearToken } from './auth';
import { useRoute } from './router';
import { api, ApiError } from './api';
import { Login } from './pages/Login';
import { Home } from './pages/Home';
import { Profile } from './pages/Profile';
import { Shell } from './components/Shell';

type Identity = { fullName: string; email: string };

export function App() {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const route = useRoute();

  useEffect(() => {
    if (!token) { setIdentity(null); return; }
    api.get<Identity>('/api/me/profile')
      .then(setIdentity)
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
      <main class="auth-shell">
        <div class="auth-card">
          <h2>Couldn't reach the dashboard</h2>
          <p class="error">{identityError}</p>
          <button type="button" class="btn-secondary" onClick={signOut}>Sign out</button>
        </div>
      </main>
    );
  }

  if (!identity) return <main class="auth-shell"><p class="muted">Loading…</p></main>;

  return (
    <Shell currentRoute={route} userName={identity.fullName} userEmail={identity.email} onSignOut={signOut}>
      {renderPage(route)}
    </Shell>
  );
}

function renderPage(route: string) {
  switch (route) {
    case '/':        return <Home />;
    case '/profile': return <Profile />;
    default:         return <NotFound route={route} />;
  }
}

function NotFound({ route }: { route: string }) {
  return (
    <>
      <div class="page-header">
        <h1>Page not found</h1>
        <p class="sub">No route matches <code>{route}</code>.</p>
      </div>
    </>
  );
}
