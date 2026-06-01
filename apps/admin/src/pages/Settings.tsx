// Account settings + system health. Password changes are PBKDF2-rehashed
// at the current iteration count, and "revoke all other sessions" bounces
// every signed-in device for this account (this device stays in).

import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../api';
import { Icon } from '../components/Icon';

type Profile = {
  accountId: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: string;
  emailVerified: boolean;
  memberId: string | null;
};

type Service = { ok: boolean; hint: string };
type SystemHealth = {
  services: {
    d1: Service; r2: Service; shurjopay: Service; brevo: Service; email_from: Service;
  };
  environment: string;
  timestamps: {
    last_paid_payment: string | null;
    last_registration: string | null;
    last_broadcast: string | null;
  };
};

export function Settings() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [health, setHealth]   = useState<SystemHealth | null>(null);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    api.get<Profile>('/api/me/profile').then(setProfile).catch((err: ApiError) => setError(err.message));
    api.get<SystemHealth>('/api/admin/system').then(setHealth).catch(() => {});
  }, []);

  return (
    <>
      <div class="page-header">
        <h1>Settings</h1>
        <p class="sub">Your account + system health. Password changes are audited.</p>
      </div>

      {error && <div class="error">{error}</div>}
      {!profile && !error && <div class="muted">Loading…</div>}

      {profile && (
        <div class="detail-grid">
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
              <dt>Role</dt><dd><span class="badge badge-ok">{profile.role}</span></dd>
              <dt>Phone</dt><dd>{profile.phone || <span class="muted">-</span>}</dd>
              <dt>BdMSO ID</dt><dd>
                {profile.memberId ? <code>{profile.memberId}</code> : <span class="muted">-</span>}
              </dd>
              <dt>Account ID</dt><dd><code>{profile.accountId}</code></dd>
            </dl>
          </section>

          <SessionsCard />
        </div>
      )}

      {profile && <PasswordCard />}
      {health && <SystemHealthCard data={health} />}
    </>
  );
}

function SystemHealthCard({ data }: { data: SystemHealth }) {
  const services = [
    { key: 'd1',         label: 'D1 database',    svc: data.services.d1 },
    { key: 'r2',         label: 'R2 (uploads)',   svc: data.services.r2 },
    { key: 'shurjopay',  label: 'shurjoPay',      svc: data.services.shurjopay },
    { key: 'brevo',      label: 'Brevo email',    svc: data.services.brevo },
    { key: 'email_from', label: 'Sender address', svc: data.services.email_from },
  ];
  function fmt(iso: string | null): string {
    if (!iso) return '-';
    const d = new Date(iso);
    const mins = Math.round((Date.now() - d.getTime()) / 60_000);
    if (mins < 1)   return 'just now';
    if (mins < 60)  return `${mins} min ago`;
    if (mins < 60*24) return `${Math.round(mins/60)} h ago`;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  return (
    <section class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;">
        <h2 style="margin:0;">System health</h2>
        <span class="badge badge-plain" style="background:var(--navy-100);color:var(--navy-700);">env: {data.environment}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;">
        {services.map((s) => (
          <div key={s.key} style="display:flex;align-items:center;gap:9px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg-alt);">
            <span style={`width:9px;height:9px;border-radius:50%;flex-shrink:0;background:${s.svc.ok ? 'var(--green)' : 'var(--red)'};`} />
            <div style="min-width:0;flex:1;">
              <div class="cell-strong" style="font-size:13px;">{s.label}</div>
              <div class="cell-sub" style="font-size:11.5px;">{s.svc.hint}</div>
            </div>
          </div>
        ))}
      </div>
      <dl class="kv" style="margin-top:14px;">
        <dt>Last paid payment</dt><dd>{fmt(data.timestamps.last_paid_payment)}</dd>
        <dt>Last registration</dt><dd>{fmt(data.timestamps.last_registration)}</dd>
        <dt>Last broadcast</dt><dd>{fmt(data.timestamps.last_broadcast)}</dd>
      </dl>
      <p class="muted" style="margin:10px 0 0;font-size:11.5px;">
        <Icon name="alert" size={11} /> Service rows reflect config presence only; "ShurjoPay" being green doesn't guarantee the gateway is reachable. Run a test purchase from the public site to verify end-to-end.
      </p>
    </section>
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
      await api.post<{ ok: true }>('/api/me/change-password', {
        current_password: current,
        new_password: next,
      });
      setCurrent(''); setNext(''); setConfirm('');
      setSuccess('Password updated. Existing sessions still work - revoke them above if you changed it because of a compromise.');
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
        <div class="form-grid" style="grid-template-columns:1fr;border:none;padding:0;">
          <Field label="Current password">
            <input type="password" required value={current} onInput={(e) => setCurrent((e.target as HTMLInputElement).value)} autocomplete="current-password" />
          </Field>
          <Field label="New password" hint="At least 8 characters.">
            <input type="password" required value={next} onInput={(e) => setNext((e.target as HTMLInputElement).value)} autocomplete="new-password" />
          </Field>
          <Field label="Confirm new password">
            <input type="password" required value={confirm} onInput={(e) => setConfirm((e.target as HTMLInputElement).value)} autocomplete="new-password" />
          </Field>
        </div>
        {error   && <div class="error" style="margin-top:12px;">{error}</div>}
        {success && <p style="color:var(--green);margin:12px 0 0;font-size:13px;">{success}</p>}
        <div class="action-row" style="margin-top:14px;">
          <button type="submit" class="btn-primary" disabled={busy}>
            {busy ? 'Updating…' : 'Update password'}
          </button>
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
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const r = await api.post<{ ok: true; revoked: number }>('/api/me/revoke-sessions');
      setMessage(r.revoked === 0 ? 'No other sessions were active.' : `Revoked ${r.revoked} other session${r.revoked === 1 ? '' : 's'}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="card">
      <h2>Sessions</h2>
      <p class="muted" style="margin-top:0;">
        Sign out of every other device currently signed in as this account.
        This device stays signed in.
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
