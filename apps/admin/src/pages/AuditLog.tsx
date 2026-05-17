// Audit log viewer. Every mutating admin endpoint records into
// admin_audit_log via recordAudit() — this screen surfaces those rows.
// Compact one-row-per-event layout; payload is shown expanded inline
// because most diffs are tiny (e.g. "from:submitted to:paid").

import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../api';
import { href } from '../router';

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
  filter: {
    action: string | null;
    target_type: string | null;
    target_id: string | null;
    account_id: string | null;
    limit: number;
  };
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
  if (type === 'user')         return href(`/users`);
  return null;
}

export function AuditLog() {
  const [data,  setData]  = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<string>('');

  useEffect(() => {
    setError(null);
    setData(null);
    const qs = actionFilter ? `?action=${encodeURIComponent(actionFilter)}` : '';
    api.get<Response>(`/api/admin/audit${qs}`)
      .then(setData)
      .catch((err: ApiError) => setError(err.message));
  }, [actionFilter]);

  return (
    <>
      <div class="page-header">
        <h1>Audit log</h1>
        <p class="sub">Every mutating admin action — who, what, when, before/after.</p>
      </div>

      <div class="toolbar">
        <label>
          <span>Action contains</span>
          <input
            type="text"
            placeholder="e.g. registration.update_status"
            value={actionFilter}
            onInput={(e) => setActionFilter((e.target as HTMLInputElement).value)}
          />
        </label>
      </div>

      {error && <div class="error">{error}</div>}
      {!data && !error && <div class="muted">Loading…</div>}

      {data && data.rows.length === 0 && (
        <div class="empty">
          <p>No audit entries match the current filter.</p>
          <p class="muted">Mutating actions appear here as soon as they happen.</p>
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
                return (
                  <tr>
                    <td class="cell-sub">{formatDateTime(r.created_at)}</td>
                    <td>{r.account_email || <code>{r.account_id.slice(0, 10)}…</code>}</td>
                    <td><code>{r.action}</code></td>
                    <td>
                      {r.target_type ? (
                        <>
                          <span class="cell-sub">{r.target_type}</span>{' '}
                          {targetHref ? (
                            <a href={targetHref}><code>{r.target_id?.slice(0, 12)}…</code></a>
                          ) : (
                            <code>{r.target_id?.slice(0, 12)}…</code>
                          )}
                        </>
                      ) : <span class="muted">—</span>}
                    </td>
                    <td>{summarizePayload(r.payload_json) || <span class="muted">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
