// Guardian login. Shared /api/login endpoint with the admin SPA. Any
// authenticated role can sign in - admins who log in here just see
// their own registrations (the admin tools live at /admin).
//
// The card has two views: the sign-in form, and a "Recover your account"
// flow (forgot password by email, or forgot email by phone number).

import { useState } from 'preact/hooks';
import { setSession } from '../auth';
import { api, ApiError } from '../api';

// Flat response shape, matches public/login.html so marketing + SPA stay
// in sync on what gets stored in localStorage.bdmso_user.
type LoginResponse = {
  ok: true;
  token: string;
  accountId: string;
  fullName: string;
  email: string;
  role: string;
};

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [forgot, setForgot]     = useState(false);

  async function submit(e: Event) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await api.post<LoginResponse>('/api/login', { email, password });
      setSession({
        token:     r.token,
        accountId: r.accountId,
        fullName:  r.fullName,
        email:     r.email,
      });
      onSignedIn();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main class="auth-shell">
      <div class="auth-card">
        <div class="brand-row">
          <img class="brand-logo" src="/images/logo.webp" alt="BdMSO" />
          <div class="brand-sub">Guardian dashboard</div>
        </div>

        {forgot ? (
          <ForgotFlow onBack={() => setForgot(false)} />
        ) : (
          <form onSubmit={submit}>
            <h1>Sign in</h1>
            <p class="muted" style="margin:8px 0 16px;">Use the email you registered your child with.</p>

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

            <p style="margin-top:14px;text-align:center;">
              <button type="button" class="auth-link" onClick={() => { setForgot(true); setError(null); }}>
                Forgot password or email?
              </button>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}

// ─── Account recovery ─────────────────────────────────────────────────────────
// Two paths: by email (sends a reset link straight away) or by phone (looks
// up a masked email first, then sends the link once the full email is given).

function ForgotFlow({ onBack }: { onBack: () => void }) {
  const [tab, setTab]       = useState<'password' | 'phone'>('password');
  const [email, setEmail]   = useState('');
  const [phone, setPhone]   = useState('');
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [sent, setSent]     = useState(false);
  const [masked, setMasked] = useState<string | null>(null);
  const [phoneChecked, setPhoneChecked] = useState(false);

  async function sendReset(toEmail: string) {
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/forgot-password', { email: toEmail });
      setSent(true);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitEmail(e: Event) {
    e.preventDefault();
    if (!email.trim()) { setError('Enter your account email.'); return; }
    await sendReset(email.trim());
  }

  async function lookupPhone(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMasked(null);
    setPhoneChecked(false);
    try {
      const r = await api.post<{ ok: true; found: boolean; maskedEmail?: string }>(
        '/api/forgot-email', { phone },
      );
      setPhoneChecked(true);
      setMasked(r.found ? (r.maskedEmail ?? null) : null);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div>
        <h1>Check your email</h1>
        <p class="muted" style="margin:8px 0 18px;">
          If that email is registered, a password reset link is on its way. The link expires in 1 hour.
        </p>
        <button type="button" class="btn-primary" onClick={onBack}>Back to sign in</button>
      </div>
    );
  }

  return (
    <div>
      <h1>Recover your account</h1>

      <div class="auth-tabs">
        <button
          type="button"
          class={tab === 'password' ? 'is-active' : ''}
          onClick={() => { setTab('password'); setError(null); }}
        >
          Forgot password
        </button>
        <button
          type="button"
          class={tab === 'phone' ? 'is-active' : ''}
          onClick={() => { setTab('phone'); setError(null); }}
        >
          Forgot email
        </button>
      </div>

      {error && <div class="error" style="margin-bottom:12px;">{error}</div>}

      {tab === 'password' ? (
        <form onSubmit={submitEmail}>
          <p class="muted" style="margin:0 0 14px;">
            Enter your account email and we'll send you a link to set a new password.
          </p>
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
          <button type="submit" class="btn-primary" disabled={busy} style="margin-top:6px;">
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      ) : (
        <div>
          <form onSubmit={lookupPhone}>
            <p class="muted" style="margin:0 0 14px;">
              Enter the phone number used during registration to find your account email.
            </p>
            <label class="auth-field">
              <span>Phone number</span>
              <input
                type="tel"
                required
                placeholder="01XXXXXXXXX"
                value={phone}
                onInput={(e) => setPhone((e.target as HTMLInputElement).value)}
              />
            </label>
            <button type="submit" class="btn-primary" disabled={busy} style="margin-top:6px;">
              {busy ? 'Searching…' : 'Find my email'}
            </button>
          </form>

          {phoneChecked && masked && (
            <form onSubmit={submitEmail} style="margin-top:18px;border-top:1px solid var(--line);padding-top:16px;">
              <p class="muted" style="margin:0 0 14px;">
                We found an account: <strong>{masked}</strong>. Enter the full email address to receive a reset link.
              </p>
              <label class="auth-field">
                <span>Full email</span>
                <input
                  type="email"
                  required
                  autocomplete="email"
                  value={email}
                  onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
                />
              </label>
              <button type="submit" class="btn-primary" disabled={busy} style="margin-top:6px;">
                {busy ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          )}

          {phoneChecked && !masked && (
            <p class="muted" style="margin:16px 0 0;">
              No account matches that phone number. Please email{' '}
              <a href="mailto:support@bdmso.org">support@bdmso.org</a> and we'll help you recover your account.
            </p>
          )}
        </div>
      )}

      <p class="muted" style="margin-top:18px;font-size:12px;">
        Don't remember your email or phone number? Email{' '}
        <a href="mailto:support@bdmso.org">support@bdmso.org</a> and our team will help you recover your account.
      </p>
      <p style="margin-top:12px;">
        <button type="button" class="auth-link" onClick={onBack}>← Back to sign in</button>
      </p>
    </div>
  );
}
