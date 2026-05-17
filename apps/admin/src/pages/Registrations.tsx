// Registrations list. The first real screen — answers an organiser's #1
// question ("who signed up?"). Sort newest-first, summary header counts,
// status + payment badges. Filters and pagination come once we hit the
// 1000-row hard cap.

import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../api';

type Row = {
  id: string;
  registration_type: string;
  student_full_name: string;
  student_class_name: string;
  student_gender: string;
  student_school: string;
  student_district: string;
  guardian_full_name: string;
  guardian_email: string;
  guardian_phone: string;
  status: 'submitted' | 'paid' | 'cancelled';
  created_at: string;
  payment_status: 'pending' | 'paid' | 'failed' | null;
  payment_amount: number | null;
  payment_tran_id: string | null;
  payment_updated_at: string | null;
};

type Summary = { total: number; paid: number; pending: number; cancelled: number };

type Response = {
  ok: true;
  rows: Row[];
  summary: Summary;
  filter: { status: string | null; type: string | null; limit: number };
};

const TYPE_LABEL: Record<string, string> = {
  'national-qualifying-round':      'National Round',
  'national-qualifying-round-both': 'National Round (M+S)',
  'national-quiz-competition':      'Quiz',
  'stem-foundation':                'STEM Foundation',
  'bdmso-preparatory':              'Prep Course',
  'stem-masterclass':               'Masterclass',
  'mock-test':                      'Mock Test',
  'lab-day':                        'Lab Day',
  'robotics-foundation':            'Robotics',
  'summer-camp':                    'SPSB Camp',
  'winter-camp':                    'Winter Camp',
  'exchange-program':               'Exchange',
};

function formatDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatBdt(n: number | null): string {
  if (n == null) return '—';
  return `৳ ${Number(n).toLocaleString('en-BD')}`;
}

export function Registrations() {
  const [data,  setData]  = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');

  useEffect(() => {
    setError(null);
    setData(null);
    const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
    api.get<Response>(`/api/admin/registrations${qs}`)
      .then(setData)
      .catch((err: ApiError) => setError(err.message));
  }, [statusFilter]);

  return (
    <>
      <div class="page-header">
        <h1>Registrations</h1>
        <p class="sub">All student registrations. Newest first.</p>
      </div>

      {data && (
        <div class="stat-row">
          <Stat label="Total"     value={data.summary.total} />
          <Stat label="Paid"      value={data.summary.paid}      tone="ok" />
          <Stat label="Pending"   value={data.summary.pending}   tone="warn" />
          <Stat label="Cancelled" value={data.summary.cancelled} tone="muted" />
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
            <option value="submitted">Submitted (pending payment)</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
      </div>

      {error && <div class="error">{error}</div>}
      {!data && !error && <div class="muted">Loading…</div>}

      {data && data.rows.length === 0 && (
        <div class="empty">
          <p>No registrations match the current filter.</p>
          <p class="muted">
            Tip: open <code>/registration</code> on the public site and submit a
            test entry to see this list come alive.
          </p>
        </div>
      )}

      {data && data.rows.length > 0 && (
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Class</th>
                <th>School / District</th>
                <th>Program</th>
                <th>Guardian</th>
                <th>Status</th>
                <th>Payment</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr>
                  <td>
                    <div class="cell-strong">{r.student_full_name}</div>
                    <div class="cell-sub">{r.student_gender}</div>
                  </td>
                  <td>{r.student_class_name}</td>
                  <td>
                    <div class="cell-strong">{r.student_school}</div>
                    <div class="cell-sub">{r.student_district}</div>
                  </td>
                  <td>{TYPE_LABEL[r.registration_type] || r.registration_type}</td>
                  <td>
                    <div class="cell-strong">{r.guardian_full_name}</div>
                    <div class="cell-sub">{r.guardian_email}</div>
                  </td>
                  <td><StatusBadge value={r.status} /></td>
                  <td>
                    <PaymentCell status={r.payment_status} amount={r.payment_amount} />
                  </td>
                  <td class="cell-sub">{formatDate(r.created_at)}</td>
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

function StatusBadge({ value }: { value: Row['status'] }) {
  const tone = value === 'paid' ? 'ok' : value === 'cancelled' ? 'muted' : 'warn';
  return <span class={`badge badge-${tone}`}>{value}</span>;
}

function PaymentCell({ status, amount }: { status: Row['payment_status']; amount: number | null }) {
  if (!status) return <span class="muted">—</span>;
  const tone = status === 'paid' ? 'ok' : status === 'failed' ? 'bad' : 'warn';
  return (
    <div>
      <span class={`badge badge-${tone}`}>{status}</span>
      <div class="cell-sub">{formatBdt(amount)}</div>
    </div>
  );
}
