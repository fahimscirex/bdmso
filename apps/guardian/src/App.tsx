// Top-level: auth gate + route switch. Bound to the shared `bdmso_user`
// session and the /dashboard prefix. The site chrome (header, footer,
// "Dashboard" CTA when signed-in, sign-out wiring) is rendered by the
// marketing site's /js/site.js via Shell - see Shell.tsx.

import { useEffect, useState } from 'preact/hooks';
import { getToken, clearSession } from './auth';
import { useRoute } from './router';
import { api, ApiError } from './api';
import { Login } from './pages/Login';
import { Home } from './pages/Home';
import { Profile } from './pages/Profile';
import { Shell } from './components/Shell';

export function App() {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [validateError, setValidateError] = useState<string | null>(null);
  const route = useRoute();

  // Cheap liveness ping - if /api/me/profile 401s the token rotted and
  // we drop back to the login screen. Don't gate render on the result;
  // the header/content render immediately from cached session data.
  useEffect(() => {
    if (!token) return;
    api.get<unknown>('/api/me/profile').catch((err: ApiError) => {
      if (err.status === 401) signOut();
      else setValidateError(err.message);
    });
  }, [token]);

  function onSignedIn() {
    setTokenState(getToken());
    setValidateError(null);
  }

  function signOut() {
    clearSession();
    setTokenState(null);
    // site.js reads bdmso_user on render; force a re-render of the
    // (now-logged-out) header by re-emitting DOMContentLoaded inside
    // Shell on next mount. For a clean state, just bounce to /login.
    location.href = '/login';
  }

  if (!token) return <Login onSignedIn={onSignedIn} />;

  if (validateError) {
    return (
      <main class="auth-shell">
        <div class="auth-card">
          <h2>Couldn't reach the dashboard</h2>
          <p class="error">{validateError}</p>
          <button type="button" class="btn-secondary" onClick={signOut}>Sign out</button>
        </div>
      </main>
    );
  }

  return (
    <Shell currentRoute={route}>
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
    <div class="page-header">
      <h1>Page not found</h1>
      <p class="sub">No route matches <code>{route}</code>.</p>
    </div>
  );
}
