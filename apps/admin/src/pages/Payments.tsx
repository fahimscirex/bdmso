// Payments list. Mirrors Registrations but groups by payment intent.
// Shows revenue at the top — the question finance asks most often.

import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../api';
import { navigate, href } from '../router';

type Row = {
  id: string;
  amount: number;
  currency: string;
  tran_id: string;
  val_id: string | null;
  gateway_status: string | null;
  status: 'pending' | 'paid' | 'failed';
  coupon_code: string | null;
  created_at: string;
  updated_at: string;
  registration_id: string | null;
  registration_type: string | null;
  student_full_name: string | null;
  guardian_full_name: string | null;
  guardian_email: string | null;
};

type Summary = { total: number; paid: number; pending: number; failed: number; revenue: number };

type Response = {
  ok: true;
  rows: Row[];
  summary: Summary;
  filter: { status: string | null; limit: number };
};

function formatBdt(n: number): string {
  return `৳ ${Number(n).toLocaleString('en-BD')}`;
}

function formatDateTime(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function Payments() {
  const [data,  setData]  = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');

  useEffect(() => {
    setError(null);
    setData(null);
    const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
    api.get<Response>(`/api/admin/payments${qs}`)
      .then(setData)
      .catch((err: ApiError) => setError(err.message));
  }, [statusFilter]);

  return (
    <>
      <div class="page-header">
        <h1>Payments</h1>
        <p class="sub">All payment attempts — bKash and SSLCommerz. Updated-first.</p>
      </div>

      {data && (
        <div class="stat-row">
          <Stat label="Revenue (BDT)" value={formatBdt(data.summary.revenue)} tone="ok" />
          <Stat label="Paid"          value={String(data.summary.paid)} />
          <Stat label="Pending"       value={String(data.summary.pending)} tone="warn" />
          <Stat label="Failed"        value={String(data.summary.failed)} tone="bad" />
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
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </label>
      </div>

      {error && <div class="error">{error}</div>}
      {!data && !error && <div class="muted">Loading…</div>}

      {data && data.rows.length === 0 && (
        <div class="empty">
          <p>No payments match the current filter.</p>
        </div>
      )}

      {data && data.rows.length > 0 && (
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Amount</th>
                <th>Student</th>
                <th>Guardian</th>
                <th>Tran ID</th>
                <th>Gateway</th>
                <th>Coupon</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((p) => {
                const linkable = !!p.registration_id;
                return (
                  <tr
                    class={linkable ? 'row-link' : undefined}
                    onClick={linkable ? () => navigate(`/registrations/${p.registration_id}`) : undefined}
                  >
                    <td>
                      <span class={`badge badge-${p.status === 'paid' ? 'ok' : p.status === 'failed' ? 'bad' : 'warn'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td><strong>{formatBdt(p.amount)}</strong></td>
                    <td>
                      {p.student_full_name ? (
                        linkable ? (
                          <a
                            class="cell-strong"
                            href={href(`/registrations/${p.registration_id}`)}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {p.student_full_name}
                          </a>
                        ) : (
                          <span class="cell-strong">{p.student_full_name}</span>
                        )
                      ) : <span class="muted">—</span>}
                      <div class="cell-sub">{p.registration_type || ''}</div>
                    </td>
                    <td>
                      <div class="cell-strong">{p.guardian_full_name || '—'}</div>
                      <div class="cell-sub">{p.guardian_email || ''}</div>
                    </td>
                    <td><code>{p.tran_id}</code></td>
                    <td>{p.gateway_status || '—'}</td>
                    <td>{p.coupon_code ? <code>{p.coupon_code}</code> : <span class="muted">—</span>}</td>
                    <td class="cell-sub">{formatDateTime(p.updated_at)}</td>
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

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'bad' | 'muted' }) {
  return (
    <div class={`stat${tone ? ` stat-${tone}` : ''}`}>
      <div class="stat-value">{value}</div>
      <div class="stat-label">{label}</div>
    </div>
  );
}
