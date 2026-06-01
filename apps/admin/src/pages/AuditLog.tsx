// Audit log viewer with action / actor / date-range filters and CSV
// export. Every mutating admin endpoint records into admin_audit_log
// via recordAudit() - this screen surfaces those rows.

import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../api';
import { href } from '../router';
import { SkRoot, SkTable } from '../components/Skeleton';
import { Icon } from '../components/Icon';
import { toCsv, downloadCsv } from '../csv';

type Row = {
  id: string;
  account_id: string;
  account_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  payload_json: string | null;
  created_at: string;
};

type Response = {
  ok: true;
  rows: Row[];
  facets: { actions: string[]; actors: string[] };
  filter: Record<string, unknown>;
};

function formatDateTime(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function summarizePayload(json: string | null): string {
  if (!json) return '';
  try {
    const obj = JSON.parse(json);
    if (obj && typeof obj === 'object' && 'from' in obj && 'to' in obj) {
      return `${obj.from} → ${obj.to}`;
    }
    return JSON.stringify(obj);
  } catch {
    return json;
  }
}

function linkForTarget(type: string | null, id: string | null): string | null {
  if (!type || !id) return null;
  if (type === 'registration') return href(`/registrations/${id}`);
  if (type === 'post')         return href(`/posts/${id}/edit`);
  if (type === 'program')      return href(`/programs/${id}/edit`);
  if (type === 'coupon')       return href(`/coupons`);
  if (type === 'user')         return href(`/users`);
  return null;
}

export function AuditLog() {
  const [data,  setData]  = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState('');
  const [actor,  setActor]  = useState('');
  const [from,   setFrom]   = useState('');
  const [to,     setTo]     = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setData(null);
    const qs: string[] = [];
    if (action) qs.push(`action=${encodeURIComponent(action)}`);
    if (actor)  qs.push(`actor=${encodeURIComponent(actor)}`);
    if (from)   qs.push(`from=${encodeURIComponent(from)}`);
    if (to)     qs.push(`to=${encodeURIComponent(to)}`);
    api.get<Response>(`/api/admin/audit${qs.length ? `?${qs.join('&')}` : ''}`)
      .then(setData)
      .catch((err: ApiError) => setError(err.message));
  }, [action, actor, from, to]);

  function exportCsv() {
    if (!data) return;
    downloadCsv(
      `bdmso-audit-${new Date().toISOString().slice(0,10)}.csv`,
      toCsv(
        ['When', 'Actor', 'Action', 'Target type', 'Target id', 'Change'],
        data.rows.map((r) => [r.created_at, r.account_email || r.account_id, r.action, r.target_type || '', r.target_id || '', summarizePayload(r.payload_json)]),
      ),
    );
  }

  function reset() {
    setAction(''); setActor(''); setFrom(''); setTo('');
  }

  const activeCount = (action?1:0)+(actor?1:0)+(from?1:0)+(to?1:0);

  return (
    <>
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
        <div>
          <h1>Audit log</h1>
          <p class="sub">Every mutating admin action - who, what, when, before/after. Click a row to expand the raw JSON.</p>
        </div>
        <button type="button" class="btn-secondary" disabled={!data} onClick={exportCsv}>
          <Icon name="download" size={14} /> Export CSV
        </button>
      </div>

      <div class="chip-row">
        <label class={`chip${action ? ' chip-active' : ''}`}>
          <span class="chip-label">Action</span>
          <select value={action} onChange={(e) => setAction((e.target as HTMLSelectElement).value)}>
            <option value="">All</option>
            {data?.facets.actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label class={`chip${actor ? ' chip-active' : ''}`}>
          <span class="chip-label">Actor</span>
          <select value={actor} onChange={(e) => setActor((e.target as HTMLSelectElement).value)}>
            <option value="">All</option>
            {data?.facets.actors.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label class={`chip${from || to ? ' chip-active' : ''}`}>
          <span class="chip-label">Date</span>
          <span style="display:flex;gap:4px;align-items:center;">
            <input type="date" value={from} onChange={(e) => setFrom((e.target as HTMLInputElement).value)} />
            <span class="muted">→</span>
            <input type="date" value={to} onChange={(e) => setTo((e.target as HTMLInputElement).value)} />
          </span>
        </label>
        {activeCount > 0 && (
          <button type="button" class="chip chip-toggle" onClick={reset}>
            <Icon name="x" size={12} /> Reset
          </button>
        )}
      </div>

      {error && <div class="error">{error}</div>}
      {!data && !error && (
        <SkRoot>
          <SkTable headers={['When', 'Actor', 'Action', 'Target', 'Change']} rows={6} />
        </SkRoot>
      )}

      {data && data.rows.length === 0 && (
        <div class="empty">
          <p>No audit entries match the current filter.</p>
          {activeCount > 0 && <p class="muted">Try <button type="button" class="link" onClick={reset}>resetting filters</button>.</p>}
        </div>
      )}

      {data && data.rows.length > 0 && (
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const targetHref = linkForTarget(r.target_type, r.target_id);
                const isExpanded = expanded === r.id;
                return (
                  <>
                    <tr
                      key={r.id}
                      class="row-link"
                      onClick={() => setExpanded(isExpanded ? null : r.id)}
                    >
                      <td class="cell-sub">{formatDateTime(r.created_at)}</td>
                      <td>{r.account_email || <code>{r.account_id.slice(0, 10)}…</code>}</td>
                      <td><code>{r.action}</code></td>
                      <td>
                        {r.target_type ? (
                          <>
                            <span class="cell-sub">{r.target_type}</span>{' '}
                            {targetHref ? (
                              <a href={targetHref} onClick={(e) => e.stopPropagation()}><code>{r.target_id?.slice(0, 12)}…</code></a>
                            ) : (
                              <code>{r.target_id?.slice(0, 12)}…</code>
                            )}
                          </>
                        ) : <span class="muted">-</span>}
                      </td>
                      <td>{summarizePayload(r.payload_json) || <span class="muted">-</span>}</td>
                    </tr>
                    {isExpanded && r.payload_json && (
                      <tr>
                        <td colspan={5} style="background:var(--bg-alt);">
                          <pre style="margin:0;padding:6px 12px;font-size:11.5px;font-family:ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-word;color:var(--ink-2);">{JSON.stringify(JSON.parse(r.payload_json), null, 2)}</pre>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
