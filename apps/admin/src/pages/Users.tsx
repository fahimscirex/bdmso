// Users / accounts management. Lists everyone in guardian_accounts and
// lets admins promote/demote via inline dropdown. Self-demotion and
// last-admin demotion are both blocked server-side.

import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../api';

type Row = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  email_verified: number;
  member_id: string | null;
  role: 'guardian' | 'admin' | 'editor' | 'mentor';
  registration_count: number;
  created_at: string;
};

type Summary = { total: number; admins: number; editors: number; guardians: number; verified: number };

type Response = {
  ok: true;
  rows: Row[];
  summary: Summary;
  filter: { role: string | null; q: string | null; limit: number };
};

function formatDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function Users() {
  const [data,  setData]  = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [query, setQuery] = useState<string>('');
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    setError(null);
    setData(null);
    const qs: string[] = [];
    if (roleFilter) qs.push(`role=${encodeURIComponent(roleFilter)}`);
    if (query)      qs.push(`q=${encodeURIComponent(query)}`);
    const url = `/api/admin/users${qs.length ? `?${qs.join('&')}` : ''}`;
    api.get<Response>(url)
      .then(setData)
      .catch((err: ApiError) => setError(err.message));
  }

  // Debounce the search box so we don't fire on every keystroke.
  useEffect(() => {
    const t = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [roleFilter, query]);

  async function changeRole(id: string, next: Row['role']) {
    setBusyId(id);
    try {
      await api.patch<{ ok: true }>(`/api/admin/users/${id}/role`, { role: next });
      setData((d) => {
        if (!d) return d;
        return { ...d, rows: d.rows.map((r) => r.id === id ? { ...r, role: next } : r) };
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
        <h1>Users</h1>
        <p class="sub">Everyone who can log in — guardians, staff, admins.</p>
      </div>

      {data && (
        <div class="stat-row">
          <Stat label="Total"     value={data.summary.total} />
          <Stat label="Admins"    value={data.summary.admins}    tone="ok" />
          <Stat label="Editors"   value={data.summary.editors}   tone="warn" />
          <Stat label="Guardians" value={data.summary.guardians} tone="muted" />
        </div>
      )}

      <div class="toolbar">
        <label>
          <span>Role</span>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter((e.target as HTMLSelectElement).value)}
          >
            <option value="">All</option>
            <option value="guardian">Guardian</option>
            <option value="admin">Admin</option>
            <option value="editor">Editor</option>
            <option value="mentor">Mentor</option>
          </select>
        </label>
        <label style="flex:1;min-width:240px;">
          <span>Search</span>
          <input
            type="search"
            placeholder="email, name, member ID…"
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            style="min-width:100%;"
          />
        </label>
      </div>

      {error && <div class="error">{error}</div>}
      {!data && !error && <div class="muted">Loading…</div>}

      {data && data.rows.length === 0 && (
        <div class="empty"><p>No users match the current filter.</p></div>
      )}

      {data && data.rows.length > 0 && (
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Member ID</th>
                <th>Phone</th>
                <th>Regs</th>
                <th>Role</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((u) => (
                <tr>
                  <td><div class="cell-strong">{u.full_name}</div></td>
                  <td>
                    {u.email}{' '}
                    {u.email_verified
                      ? <span class="badge badge-ok">verified</span>
                      : <span class="badge badge-muted">unverified</span>}
                  </td>
                  <td>{u.member_id ? <code>{u.member_id}</code> : <span class="muted">—</span>}</td>
                  <td>{u.phone || <span class="muted">—</span>}</td>
                  <td>{u.registration_count}</td>
                  <td>
                    <select
                      class="inline-select"
                      value={u.role}
                      disabled={busyId === u.id}
                      onChange={(e) => {
                        const next = (e.target as HTMLSelectElement).value as Row['role'];
                        if (next !== u.role) changeRole(u.id, next);
                      }}
                    >
                      <option value="guardian">guardian</option>
                      <option value="admin">admin</option>
                      <option value="editor">editor</option>
                      <option value="mentor">mentor</option>
                    </select>
                  </td>
                  <td class="cell-sub">{formatDate(u.created_at)}</td>
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
