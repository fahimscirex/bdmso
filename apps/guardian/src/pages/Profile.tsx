// Guardian profile. Same /api/me/* surface the admin Settings page uses,
// minus the role-specific bits. Two actions: change password, sign out
// of every other device.

import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../api';

type ProfileRow = {
  accountId: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: string;
  emailVerified: boolean;
  memberId: string | null;
};

export function Profile() {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    api.get<ProfileRow>('/api/me/profile')
      .then(setProfile)
      .catch((err: ApiError) => setError(err.message));
  }, []);

  return (
    <>
      <div class="page-header">
        <h1>Profile</h1>
        <p class="sub">Your account details and password.</p>
      </div>

      {error && <div class="error">{error}</div>}
      {!profile && !error && <p class="muted">Loading…</p>}

      {profile && (
        <>
          <section class="card">
            <h2>Account</h2>
            <dl class="kv">
              <dt>Name</dt><dd>{profile.fullName}</dd>
              <dt>Email</dt><dd>
                {profile.email}{' '}
                {profile.emailVerified
                  ? <span class="badge badge-ok">verified</span>
                  : <span class="badge badge-muted">unverified</span>}
              </dd>
              <dt>Phone</dt><dd>{profile.phone || <span class="muted">—</span>}</dd>
              <dt>Member ID</dt><dd>
                {profile.memberId ? <code>{profile.memberId}</code> : <span class="muted">Issued after your first paid registration.</span>}
              </dd>
            </dl>
            <p class="muted" style="margin:14px 0 0;font-size:12.5px;">
              Need to change your name, email or phone? Email <a href="mailto:hello@bdmso.org">hello@bdmso.org</a> — we update these manually for now to keep your member record stable.
            </p>
          </section>

          <PasswordCard />
          <SessionsCard />
        </>
      )}
    </>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState('');
  const [next,    setNext]    = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(e: Event) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (next !== confirm) { setError("New password and confirmation don't match."); return; }
    setBusy(true);
    try {
      await api.post<{ ok: true }>('/api/me/change-password', { current_password: current, new_password: next });
      setCurrent(''); setNext(''); setConfirm('');
      setSuccess('Password updated.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="card">
      <h2>Change password</h2>
      <form onSubmit={submit}>
        <div class="form-grid" style="grid-template-columns:1fr;border:none;padding:0;gap:12px;">
          <Field label="Current password">
            <input type="password" required autocomplete="current-password" value={current} onInput={(e) => setCurrent((e.target as HTMLInputElement).value)} />
          </Field>
          <Field label="New password" hint="At least 8 characters.">
            <input type="password" required autocomplete="new-password" value={next} onInput={(e) => setNext((e.target as HTMLInputElement).value)} />
          </Field>
          <Field label="Confirm new password">
            <input type="password" required autocomplete="new-password" value={confirm} onInput={(e) => setConfirm((e.target as HTMLInputElement).value)} />
          </Field>
        </div>
        {error   && <div class="error" style="margin-top:12px;">{error}</div>}
        {success && <p style="color:var(--green);margin:12px 0 0;font-size:13px;">{success}</p>}
        <div class="action-row" style="margin-top:14px;">
          <button type="submit" class="btn-primary" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button>
        </div>
      </form>
    </section>
  );
}

function SessionsCard() {
  const [busy,    setBusy]    = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  async function revoke() {
    if (!confirm('Sign out of every other device signed in as you?')) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const r = await api.post<{ ok: true; revoked: number }>('/api/me/revoke-sessions');
      setMessage(r.revoked === 0 ? 'No other sessions were active.' : `Revoked ${r.revoked} session${r.revoked === 1 ? '' : 's'}.`);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <section class="card">
      <h2>Sessions</h2>
      <p class="muted" style="margin-top:0;">
        Sign out of every other device. This device stays signed in.
      </p>
      <div class="action-row">
        <button type="button" class="btn-secondary" onClick={revoke} disabled={busy}>
          {busy ? 'Revoking…' : 'Sign out everywhere else'}
        </button>
      </div>
      {message && <p style="color:var(--green);margin:12px 0 0;font-size:13px;">{message}</p>}
      {error   && <div class="error" style="margin-top:12px;">{error}</div>}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: any }) {
  return (
    <div class="field">
      <label>{label}</label>
      {children}
      {hint && <p class="field-hint">{hint}</p>}
    </div>
  );
}
