// Admin SPA shell with a real login flow you can try end-to-end.
//
// Login flow:
//   1. POST /api/login → { token, role, ... }
//   2. If role !== 'admin' → show "not admin" message, no token saved
//   3. Otherwise → save token to localStorage and fetch /api/admin/health
//      to confirm the admin namespace works with the new bearer token
//
// This is intentionally bare — no router, no TanStack Query yet. Sprint 1
// replaces this with real screens (users, posts, programs, ops).

import { useEffect, useState } from 'preact/hooks';

const TOKEN_KEY = 'bdmso.admin.token';

type LoginResponse = {
  ok: true;
  token: string;
  accountId: string;
  fullName: string;
  email: string;
  role: string;
  emailVerified: boolean;
};

type HealthResponse = {
  ok: true;
  accountId: string;
  email: string;
  role: string;
  serverTime: string;
};

export function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));

  if (!token) {
    return <Login onLogin={(t) => { localStorage.setItem(TOKEN_KEY, t); setToken(t); }} />;
  }

  return (
    <SignedIn
      token={token}
      onLogout={() => { localStorage.removeItem(TOKEN_KEY); setToken(null); }}
    />
  );
}

function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: Event) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      const data = body as LoginResponse;
      if (data.role !== 'admin') {
        throw new Error(`Your account has role "${data.role}". Admin access only.`);
      }
      onLogin(data.token);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main class="shell">
      <form class="card" onSubmit={submit}>
        <div class="eyebrow">BdMSO admin</div>
        <h1>Sign in</h1>
        <p class="sub">Admin-only. Guardians log in at <code>/dashboard</code>.</p>

        <label>
          <span>Email</span>
          <input
            type="email"
            value={email}
            onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
            required
            autocomplete="username"
            autofocus
          />
        </label>

        <label>
          <span>Password</span>
          <input
            type="password"
            value={password}
            onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
            required
            autocomplete="current-password"
          />
        </label>

        {error && <div class="error">{error}</div>}

        <button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}

function SignedIn({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/health', {
          headers: { authorization: `Bearer ${token}` },
        });
        const body = await res.json();
        if (!res.ok) {
          if (res.status === 401) { onLogout(); return; }
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        setHealth(body as HealthResponse);
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, [token, onLogout]);

  return (
    <main class="shell">
      <div class="card">
        <div class="eyebrow">BdMSO admin</div>
        <h1>You're in.</h1>
        <p class="sub">
          This is the admin SPA shell. Real screens (users, posts, programs, ops)
          land in Sprint 1.
        </p>

        {error && <div class="error">{error}</div>}
        {health && (
          <dl class="kv">
            <dt>Email</dt><dd>{health.email}</dd>
            <dt>Role</dt><dd>{health.role}</dd>
            <dt>Account ID</dt><dd><code>{health.accountId}</code></dd>
            <dt>Server time</dt><dd>{new Date(health.serverTime).toLocaleString()}</dd>
          </dl>
        )}

        <button type="button" onClick={onLogout}>Sign out</button>
      </div>
    </main>
  );
}
