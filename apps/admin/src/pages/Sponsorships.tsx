// Sponsorship enquiries inbox. New leads come in with status='new'; admins
// move them to 'contacted' once they've reached out, 'closed' when wrapped.
// Status mutation is inline (no detail page) - the message body is shown
// expanded right in the row.

import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../api';
import { SkRoot, SkStatRow, SkTable } from '../components/Skeleton';

type Row = {
  id: string;
  organization: string;
  contact_person: string;
  email: string;
  phone: string | null;
  interest: string;
  message: string;
  status: 'new' | 'contacted' | 'closed';
  source_page: string | null;
  created_at: string;
};

type Summary = { total: number; unread: number; contacted: number; closed: number };

type Response = {
  ok: true;
  rows: Row[];
  summary: Summary;
  filter: { status: string | null; limit: number };
};

function formatDateTime(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function Sponsorships() {
  const [data,  setData]  = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    setError(null);
    setData(null);
    const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
    api.get<Response>(`/api/admin/sponsorships${qs}`)
      .then(setData)
      .catch((err: ApiError) => setError(err.message));
  }

  useEffect(load, [statusFilter]);

  async function changeStatus(id: string, next: Row['status']) {
    setBusyId(id);
    try {
      await api.patch<{ ok: true }>(`/api/admin/sponsorships/${id}/status`, { status: next });
      // Optimistic patch of the local row so the screen doesn't jump.
      setData((d) => {
        if (!d) return d;
        return {
          ...d,
          rows: d.rows.map((r) => r.id === id ? { ...r, status: next } : r),
        };
      });
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div class="page-header">
        <h1>Sponsorships</h1>
        <p class="sub">Enquiries from prospective partners and sponsors.</p>
      </div>

      {data && (
        <div class="stat-row">
          <Stat label="Total"     value={data.summary.total} />
          <Stat label="New"       value={data.summary.unread}    tone="warn" />
          <Stat label="Contacted" value={data.summary.contacted} tone="ok" />
          <Stat label="Closed"    value={data.summary.closed}    tone="muted" />
        </div>
      )}

      <div class="toolbar">
        <label>
          <span>Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter((e.target as HTMLSelectElement).value)}
          >
            <option value="">All</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="closed">Closed</option>
          </select>
        </label>
      </div>

      {error && <div class="error">{error}</div>}
      {!data && !error && (
        <SkRoot>
          <SkStatRow />
          <SkTable headers={['Organization', 'Contact', 'Interest', 'Message', 'Status', 'Received']} rows={5} />
        </SkRoot>
      )}

      {data && data.rows.length === 0 && (
        <div class="empty">
          <p>No sponsorship enquiries yet.</p>
          <p class="muted">They'll appear here when partners submit <code>/sponsorship</code>.</p>
        </div>
      )}

      {data && data.rows.length > 0 && (
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Organization</th>
                <th>Contact</th>
                <th>Interest</th>
                <th>Message</th>
                <th>Status</th>
                <th>Received</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr>
                  <td><div class="cell-strong">{r.organization}</div></td>
                  <td>
                    <div class="cell-strong">{r.contact_person}</div>
                    <div class="cell-sub"><a href={`mailto:${r.email}`}>{r.email}</a></div>
                    {r.phone && <div class="cell-sub">{r.phone}</div>}
                  </td>
                  <td>{r.interest}</td>
                  <td style="max-width:340px;white-space:normal;">{r.message}</td>
                  <td>
                    <select
                      class="inline-select"
                      value={r.status}
                      disabled={busyId === r.id}
                      onChange={(e) => {
                        const next = (e.target as HTMLSelectElement).value as Row['status'];
                        if (next !== r.status) changeStatus(r.id, next);
                      }}
                    >
                      <option value="new">new</option>
                      <option value="contacted">contacted</option>
                      <option value="closed">closed</option>
                    </select>
                  </td>
                  <td class="cell-sub">{formatDateTime(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warn' | 'muted' }) {
  return (
    <div class={`stat${tone ? ` stat-${tone}` : ''}`}>
      <div class="stat-value">{value}</div>
      <div class="stat-label">{label}</div>
    </div>
  );
}
