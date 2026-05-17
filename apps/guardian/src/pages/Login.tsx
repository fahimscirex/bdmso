// Guardian login. Shared /api/login endpoint with the admin SPA. Any
// authenticated role can sign in — admins who log in here just see
// their own registrations (the admin tools live at /admin).

import { useState } from 'preact/hooks';
import { setToken } from '../auth';
import { api, ApiError } from '../api';

type LoginResponse = { ok: true; token: string; account: { fullName: string; email: string; role: string } };

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function submit(e: Event) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await api.post<LoginResponse>('/api/login', { email, password });
      setToken(r.token);
      onSignedIn();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main class="auth-shell">
      <form class="auth-card" onSubmit={submit}>
        <div class="brand-row">
          <div class="brand-mark">Bd</div>
          <div>
            <div class="brand-name">BdMSO</div>
            <div class="brand-sub">Guardian dashboard</div>
          </div>
        </div>

        <h1>Sign in</h1>
        <p class="muted" style="margin:-4px 0 14px;">Use the email you registered your child with.</p>

        {error && <div class="error" style="margin-bottom:12px;">{error}</div>}

        <label class="auth-field">
          <span>Email</span>
          <input
            type="email"
            required
            autocomplete="email"
            value={email}
            onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
          />
        </label>
        <label class="auth-field">
          <span>Password</span>
          <input
            type="password"
            required
            autocomplete="current-password"
            value={password}
            onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
          />
        </label>

        <button type="submit" class="btn-primary" disabled={busy} style="margin-top:6px;">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p class="muted" style="margin-top:18px;font-size:12px;text-align:center;">
          New here? Registration opens with each program — check the home page.
        </p>
      </form>
    </main>
  );
}
