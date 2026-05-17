import { useState } from 'preact/hooks';
import { setToken } from '../auth';

type LoginResponse = {
  ok: true;
  token: string;
  accountId: string;
  fullName: string;
  email: string;
  role: string;
};

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
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
      setToken(data.token);
      onSignedIn();
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
