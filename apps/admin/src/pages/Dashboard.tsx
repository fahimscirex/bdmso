// Landing page after sign-in. Pulls summaries from the existing list
// endpoints in parallel - no extra API surface area - and renders a
// KPI grid, a "needs attention" widget, 30-day sparklines, conversion
// funnel, and a short "latest activity" feed from the audit log.

import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../api';
import { navigate, href } from '../router';
import { SkRoot, SkStatRow, SkCard } from '../components/Skeleton';
import { Sparkline, padDailySeries } from '../components/Sparkline';
import { Icon } from '../components/Icon';

type RegSummary = { total: number; paid: number; pending: number; cancelled: number };
type PaySummary = { total: number; paid: number; pending: number; failed: number; revenue: number };
type SpoSummary = { total: number; unread: number; contacted: number; closed: number };
type UsrSummary = { total: number; admins: number; editors: number; guardians: number; verified: number };

type SeriesReg = { day: string; total: number; paid: number };
type SeriesPay = { day: string; count: number; revenue: number };
type Coupon = { code: string; expires_at: string; used_count: number; max_uses: number | null };

type Analytics = {
  funnel: { total: number; submitted: number; paid: number; cancelled: number };
  byVenue: { venue: string; total: number; paid: number }[];
  byProgram: { type: string; label: string; total: number; paid: number }[];
  revenue: number;
  deltas: {
    reg_today: number; reg_yesterday: number;
    paid_today: number; paid_yesterday: number;
    rev_today: number; rev_yesterday: number;
  };
  series: { registrations: SeriesReg[]; payments: SeriesPay[] };
  attention: {
    stuck_unpaid: number; recent_failed: number;
    unread_sponsorships: number; expiring_coupons: number;
    expiring_list: Coupon[];
  };
};

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
  an: Analytics;
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

// Compact delta line under a KPI value. Returns a "muted info" line when
// today is 0, an "up" arrow when today > yesterday, "down" when less.
// Special-cased so we never read "▼ 0 today · 100% vs yesterday" - that
// negative spin reads worse than just saying "no activity today."
function DeltaLine({ today, yesterday }: { today: number; yesterday: number; currency?: boolean }) {
  if (today === 0 && yesterday === 0) return null;
  if (today === 0) {
    return (
      <div class="kpi-delta-row">
        <span class="kpi-delta kpi-delta-flat">— 0%</span>
        <span class="kpi-delta-caption">no activity today</span>
      </div>
    );
  }
  if (yesterday === 0) {
    return (
      <div class="kpi-delta-row">
        <span class="kpi-delta kpi-delta-up">↗ new</span>
        <span class="kpi-delta-caption">from yesterday</span>
      </div>
    );
  }
  const diff = today - yesterday;
  if (diff === 0) {
    return (
      <div class="kpi-delta-row">
        <span class="kpi-delta kpi-delta-flat">— 0%</span>
        <span class="kpi-delta-caption">vs yesterday</span>
      </div>
    );
  }
  const pct = Math.round(Math.abs(diff) / yesterday * 100);
  const cls = diff > 0 ? 'kpi-delta-up' : 'kpi-delta-down';
  const arrow = diff > 0 ? '↗' : '↘';
  return (
    <div class="kpi-delta-row">
      <span class={`kpi-delta ${cls}`}>{arrow} {pct}%</span>
      <span class="kpi-delta-caption">from yesterday</span>
    </div>
  );
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
      api.get<Analytics>('/api/admin/analytics'),
    ])
      .then(([r, p, s, u, a, an]) => setData({
        reg: r.summary, pay: p.summary, spo: s.summary, usr: u.summary, audit: a.rows, an,
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
      {!data && !error && (
        <SkRoot>
          <SkStatRow />
          <SkStatRow />
          <SkCard title="Conversion funnel"     lines={1} />
          <SkCard title="Latest admin activity" lines={5} />
          <div class="detail-grid">
            <SkCard title="By exam venue" lines={3} />
            <SkCard title="By program"    lines={3} />
          </div>
        </SkRoot>
      )}

      {data && (
        <>
          {/* Primary KPIs: registrations, paid, pending, revenue.
              Each tile carries a 30-day sparkline + today-vs-yesterday delta.
              (The previous "Needs attention" card moved to the topbar bell.) */}
          <div class="stat-row">
            <KpiTile
              label="Registrations" value={data.reg.total}
              onClick={() => navigate('/registrations')}
              spark={padDailySeries(data.an.series.registrations, 30, (r) => r.total)}
              delta={<DeltaLine today={data.an.deltas.reg_today} yesterday={data.an.deltas.reg_yesterday} />}
            />
            <KpiTile
              label="Paid" value={data.reg.paid} tone="ok"
              onClick={() => navigate('/registrations')}
              spark={padDailySeries(data.an.series.registrations, 30, (r) => r.paid)}
              sparkTone="green"
              delta={<DeltaLine today={data.an.deltas.paid_today} yesterday={data.an.deltas.paid_yesterday} />}
            />
            <KpiTile
              label="Pending pay" value={data.reg.pending} tone="warn"
              onClick={() => navigate('/registrations')}
              spark={padDailySeries(data.an.series.registrations, 30, (r) => r.total - r.paid)}
              sparkTone="amber"
            />
            <KpiTile
              label="Revenue" value={formatBdt(data.pay.revenue)} tone="ok"
              onClick={() => navigate('/payments')}
              spark={padDailySeries(data.an.series.payments, 30, (r) => r.revenue)}
              sparkTone="green"
              delta={<DeltaLine today={data.an.deltas.rev_today} yesterday={data.an.deltas.rev_yesterday} currency />}
            />
          </div>

          {/* Secondary row: items + segments. No sparklines (less central). */}
          <div class="stat-row">
            <Tile label="New sponsorships" value={data.spo.unread} tone={data.spo.unread > 0 ? 'warn' : 'muted'} onClick={() => navigate('/sponsorships')} />
            <Tile label="Failed payments"  value={data.pay.failed} tone={data.pay.failed > 0 ? 'bad' : 'muted'} onClick={() => navigate('/payments')} />
            <Tile label="Users"            value={data.usr.total} onClick={() => navigate('/users')} />
            <Tile label="Admins"           value={data.usr.admins} tone="ok" onClick={() => navigate('/users')} />
          </div>

          <section class="card">
            <h2>Conversion funnel</h2>
            <div class="stat-row" style="margin-top:4px;">
              <div class="stat"><div class="stat-value">{data.an.funnel.total}</div><div class="stat-label">Total</div></div>
              <div class="stat stat-warn"><div class="stat-value">{data.an.funnel.submitted}</div><div class="stat-label">Awaiting payment</div></div>
              <div class="stat stat-ok"><div class="stat-value">{data.an.funnel.paid}</div><div class="stat-label">Paid</div></div>
              <div class="stat stat-ok"><div class="stat-value">{conversionPct(data.an.funnel)}%</div><div class="stat-label">Paid conversion</div></div>
            </div>
          </section>

          <section class="card">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
              <h2 style="margin:0;">Latest admin activity</h2>
              <a class="link" href={href('/audit')} onClick={(e) => { e.preventDefault(); navigate('/audit'); }}>
                View all <Icon name="chevron-right" size={14} />
              </a>
            </div>
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
                    <li key={a.id}>
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

          <div class="detail-grid">
            <section class="card">
              <h2>By exam venue</h2>
              {data.an.byVenue.length === 0
                ? <p class="muted" style="margin:0;">No registrations yet.</p>
                : <Breakdown rows={data.an.byVenue.map((v) => ({ label: v.venue, total: v.total, paid: v.paid }))} />}
            </section>
            <section class="card">
              <h2>By program</h2>
              {data.an.byProgram.length === 0
                ? <p class="muted" style="margin:0;">No registrations yet.</p>
                : <Breakdown rows={data.an.byProgram.map((p) => ({ label: p.label, total: p.total, paid: p.paid }))} />}
            </section>
          </div>
        </>
      )}
    </>
  );
}

function conversionPct(f: { total: number; paid: number; cancelled: number }): number {
  const base = f.total - f.cancelled;
  return base > 0 ? Math.round((f.paid / base) * 100) : 0;
}

function Breakdown({ rows }: { rows: { label: string; total: number; paid: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <div>
      {rows.map((r) => (
        <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--line-2,#ebeff6);">
          <div class="cell-strong" style="flex:0 0 40%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{r.label}</div>
          <div style="flex:1;background:var(--line,#dbe1ec);border-radius:999px;height:8px;">
            <div style={`background:var(--navy-700,#4252ab);height:8px;border-radius:999px;width:${Math.round((r.total / max) * 100)}%;`} />
          </div>
          <div style="flex:0 0 auto;white-space:nowrap;font-size:13px;">
            <strong>{r.total}</strong> <span class="cell-sub">· {r.paid} paid</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// Plain tile (no sparkline) - secondary row.
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

// Primary KPI tile - label + value + delta on the left, sparkline on
// the right (Salce-style layout).
function KpiTile({ label, value, tone, sparkTone = 'navy', spark, delta, onClick }: {
  label: string;
  value: number | string;
  tone?: 'ok' | 'warn' | 'bad' | 'muted';
  sparkTone?: 'navy' | 'green' | 'amber' | 'red';
  spark?: number[];
  delta?: preact.JSX.Element | null;
  onClick: () => void;
}) {
  return (
    <button type="button" class={`stat stat-tile stat-kpi${tone ? ` stat-${tone}` : ''}`} onClick={onClick}>
      <div class="stat-kpi-top">
        <div class="stat-kpi-left">
          <div class="stat-label">{label}</div>
          <div class="stat-value">{value}</div>
        </div>
        {spark && spark.length > 1 && <Sparkline data={spark} tone={sparkTone} height={38} />}
      </div>
      {delta}
    </button>
  );
}
