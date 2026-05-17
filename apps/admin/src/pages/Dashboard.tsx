// Landing page after sign-in. Pulls summaries from the existing list
// endpoints in parallel — no extra API surface area — and renders a
// KPI grid plus a short "latest activity" feed from the audit log.

import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../api';
import { navigate, href } from '../router';

type RegSummary = { total: number; paid: number; pending: number; cancelled: number };
type PaySummary = { total: number; paid: number; pending: number; failed: number; revenue: number };
type SpoSummary = { total: number; unread: number; contacted: number; closed: number };
type UsrSummary = { total: number; admins: number; editors: number; guardians: number; verified: number };

type AuditRow = {
  id: string;
  account_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  payload_json: string | null;
  created_at: string;
};

type Bundle = {
  reg: RegSummary;
  pay: PaySummary;
  spo: SpoSummary;
  usr: UsrSummary;
  audit: AuditRow[];
};

function formatBdt(n: number): string {
  return `৳ ${Number(n).toLocaleString('en-BD')}`;
}

function formatDateTime(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function summarizePayload(json: string | null): string {
  if (!json) return '';
  try {
    const o = JSON.parse(json);
    if (o && typeof o === 'object' && 'from' in o && 'to' in o) return `${o.from} → ${o.to}`;
    return '';
  } catch { return ''; }
}

export function Dashboard() {
  const [data,  setData]  = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<{ summary: RegSummary }>('/api/admin/registrations?limit=1'),
      api.get<{ summary: PaySummary }>('/api/admin/payments?limit=1'),
      api.get<{ summary: SpoSummary }>('/api/admin/sponsorships?limit=1'),
      api.get<{ summary: UsrSummary }>('/api/admin/users?limit=1'),
      api.get<{ rows: AuditRow[] }>('/api/admin/audit?limit=8'),
    ])
      .then(([r, p, s, u, a]) => setData({
        reg: r.summary, pay: p.summary, spo: s.summary, usr: u.summary, audit: a.rows,
      }))
      .catch((err: ApiError) => setError(err.message));
  }, []);

  return (
    <>
      <div class="page-header">
        <h1>Dashboard</h1>
        <p class="sub">Everything at a glance. Click any tile to drill down.</p>
      </div>

      {error && <div class="error">{error}</div>}
      {!data && !error && <div class="muted">Loading…</div>}

      {data && (
        <>
          <div class="stat-row">
            <Tile label="Registrations" value={data.reg.total} onClick={() => navigate('/registrations')} />
            <Tile label="Paid"          value={data.reg.paid} tone="ok" onClick={() => navigate('/registrations')} />
            <Tile label="Pending pay"   value={data.reg.pending} tone="warn" onClick={() => navigate('/registrations')} />
            <Tile label="Revenue"       value={formatBdt(data.pay.revenue)} tone="ok" onClick={() => navigate('/payments')} />
          </div>

          <div class="stat-row">
            <Tile label="New sponsorships" value={data.spo.unread} tone={data.spo.unread > 0 ? 'warn' : 'muted'} onClick={() => navigate('/sponsorships')} />
            <Tile label="Failed payments"  value={data.pay.failed} tone={data.pay.failed > 0 ? 'bad' : 'muted'} onClick={() => navigate('/payments')} />
            <Tile label="Users"            value={data.usr.total} onClick={() => navigate('/users')} />
            <Tile label="Admins"           value={data.usr.admins} tone="ok" onClick={() => navigate('/users')} />
          </div>

          <section class="card">
            <h2>Latest admin activity</h2>
            {data.audit.length === 0 ? (
              <p class="muted" style="margin:0;">No actions recorded yet.</p>
            ) : (
              <ul class="activity">
                {data.audit.map((a) => {
                  const change = summarizePayload(a.payload_json);
                  const targetHref = !a.target_id ? null
                    : a.target_type === 'registration' ? href(`/registrations/${a.target_id}`)
                    : a.target_type === 'post'         ? href(`/posts/${a.target_id}/edit`)
                    : a.target_type === 'program'      ? href(`/programs/${a.target_id}/edit`)
                    : null;
                  return (
                    <li>
                      <span class="cell-sub">{formatDateTime(a.created_at)}</span>{' '}
                      <strong>{a.account_email || 'system'}</strong>{' '}
                      <code>{a.action}</code>
                      {change && <> · {change}</>}
                      {targetHref && <> · <a href={targetHref}>open</a></>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}

function Tile({ label, value, tone, onClick }: {
  label: string;
  value: number | string;
  tone?: 'ok' | 'warn' | 'bad' | 'muted';
  onClick: () => void;
}) {
  return (
    <button type="button" class={`stat stat-tile${tone ? ` stat-${tone}` : ''}`} onClick={onClick}>
      <div class="stat-value">{value}</div>
      <div class="stat-label">{label}</div>
    </button>
  );
}
