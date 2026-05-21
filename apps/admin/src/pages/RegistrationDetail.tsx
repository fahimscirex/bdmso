// Single-registration view. Shows student + guardian profile, all payment
// rows, and lets the admin change registration status (auditable mutation).

import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../api';
import { navigate, href } from '../router';

type Registration = {
  id: string;
  registration_type: string;
  student_full_name: string;
  student_date_of_birth: string;
  student_class_name: string;
  student_gender: string;
  student_medium: string | null;
  student_school: string;
  student_district: string;
  guardian_account_id: string;
  guardian_full_name: string;
  guardian_relationship: string;
  guardian_phone: string;
  guardian_email: string;
  guardian_address: string;
  preferred_venue: string | null;
  status: 'submitted' | 'paid' | 'cancelled';
  source_page: string | null;
  created_at: string;
  guardian_email_verified: number;
  account_member_id: string | null;
};

type Payment = {
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
};

type Response = { ok: true; registration: Registration; payments: Payment[] };

function formatBdt(n: number): string {
  return `৳ ${Number(n).toLocaleString('en-BD')}`;
}

function formatDateTime(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function RegistrationDetail({ id }: { id: string }) {
  const [data,  setData]  = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy,  setBusy]  = useState(false);

  useEffect(() => {
    api.get<Response>(`/api/admin/registrations/${id}`)
      .then(setData)
      .catch((err: ApiError) => setError(err.message));
  }, [id]);

  async function changeStatus(next: Registration['status']) {
    if (!data) return;
    if (!confirm(`Change status from "${data.registration.status}" to "${next}"?`)) return;
    setBusy(true);
    try {
      await api.patch<{ ok: true }>(`/api/admin/registrations/${id}/status`, { status: next });
      const refreshed = await api.get<Response>(`/api/admin/registrations/${id}`);
      setData(refreshed);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorPanel error={error} />;
  if (!data) return <div class="muted">Loading…</div>;

  const r = data.registration;

  return (
    <>
      <div class="page-header">
        <a class="back-link" href={href('/registrations')} onClick={(e) => { e.preventDefault(); navigate('/registrations'); }}>
          ← Back to Registrations
        </a>
        <h1 style="margin-top:8px;">{r.student_full_name}</h1>
        <p class="sub">
          {r.student_class_name} · {r.registration_type} ·{' '}
          <span class={`badge badge-${r.status === 'paid' ? 'ok' : r.status === 'cancelled' ? 'muted' : 'warn'}`}>
            {r.status}
          </span>
        </p>
      </div>

      <div class="detail-grid">
        <section class="card">
          <h2>Student</h2>
          <dl class="kv">
            <dt>Full name</dt><dd>{r.student_full_name}</dd>
            <dt>Class</dt><dd>{r.student_class_name}</dd>
            <dt>Gender</dt><dd>{r.student_gender}</dd>
            <dt>Date of birth</dt><dd>{r.student_date_of_birth}</dd>
            <dt>Medium</dt><dd>{r.student_medium || '-'}</dd>
            <dt>School</dt><dd>{r.student_school}</dd>
            <dt>District</dt><dd>{r.student_district}</dd>
            {r.preferred_venue && <><dt>Exam region</dt><dd>{r.preferred_venue}</dd></>}
            <dt>BdMSO ID</dt><dd>
              {r.account_member_id
                ? <code>{r.account_member_id}</code>
                : <span class="muted">Assigned on first paid receipt.</span>}
            </dd>
          </dl>
        </section>

        <section class="card">
          <h2>Guardian</h2>
          <dl class="kv">
            <dt>Name</dt><dd>{r.guardian_full_name}</dd>
            <dt>Relationship</dt><dd>{r.guardian_relationship}</dd>
            <dt>Email</dt><dd>{r.guardian_email} {r.guardian_email_verified ? <span class="badge badge-ok">verified</span> : <span class="badge badge-muted">unverified</span>}</dd>
            <dt>Phone</dt><dd>{r.guardian_phone}</dd>
            <dt>Address</dt><dd>{r.guardian_address}</dd>
          </dl>
        </section>
      </div>

      <section class="card">
        <h2>Payments ({data.payments.length})</h2>
        {data.payments.length === 0 ? (
          <p class="muted">No payment attempts yet.</p>
        ) : (
          <div class="table-wrap" style="margin-top:8px;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Status</th><th>Amount</th><th>Tran ID</th><th>Gateway</th><th>Coupon</th><th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr>
                    <td><span class={`badge badge-${p.status === 'paid' ? 'ok' : p.status === 'failed' ? 'bad' : 'warn'}`}>{p.status}</span></td>
                    <td><strong>{formatBdt(p.amount)}</strong></td>
                    <td><code>{p.tran_id}</code></td>
                    <td>{p.gateway_status || '-'}</td>
                    <td>{p.coupon_code ? <code>{p.coupon_code}</code> : <span class="muted">-</span>}</td>
                    <td class="cell-sub">{formatDateTime(p.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section class="card">
        <h2>Actions</h2>
        <p class="muted" style="margin-top:0;">All status changes are recorded in the audit log.</p>
        <div class="action-row">
          {(['submitted', 'paid', 'cancelled'] as const).map((s) => (
            <button
              type="button"
              class="btn-secondary"
              disabled={busy || r.status === s}
              onClick={() => changeStatus(s)}
            >
              Mark {s}
            </button>
          ))}
        </div>
        <p class="cell-sub" style="margin-top:14px;">Created {formatDateTime(r.created_at)} via {r.source_page || 'unknown source'}.</p>
      </section>
    </>
  );
}

function ErrorPanel({ error }: { error: string }) {
  return (
    <>
      <div class="page-header">
        <a class="back-link" href={href('/registrations')} onClick={(e) => { e.preventDefault(); navigate('/registrations'); }}>
          ← Back to Registrations
        </a>
        <h1>Couldn't load registration</h1>
      </div>
      <div class="error">{error}</div>
    </>
  );
}
