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
  status: 'pending' | 'paid' | 'failed' | 'cancelled';
  coupon_code: string | null;
  created_at: string;
  updated_at: string;
  registration_id: string;
  program: string;
  class_name: string;
  reg_status: string;
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
  const [selPayId, setSelPayId] = useState<string>('');  // which payment row the actions target

  useEffect(() => {
    api.get<Response>(`/api/admin/registrations/${id}`)
      .then(setData)
      .catch((err: ApiError) => setError(err.message));
  }, [id]);

  async function changeStatus(next: Registration['status'], regId: string, curStatus: string) {
    if (!confirm(`Change status from "${curStatus}" to "${next}"?`)) return;
    setBusy(true);
    try {
      await api.patch<{ ok: true }>(`/api/admin/registrations/${regId}/status`, { status: next });
      const refreshed = await api.get<Response>(`/api/admin/registrations/${id}`);
      setData(refreshed);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    setBusy(true);
    try {
      const res = await api.post<{ ok: true; alreadyVerified?: boolean }>(
        `/api/admin/registrations/${id}/resend-verification`, {},
      );
      alert(res.alreadyVerified
        ? 'That guardian email is already verified.'
        : 'Verification email sent.');
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // ── Per-payment actions (operate on the selected row) ──────────────────────
  async function markPaymentPaid(payId: string) {
    if (!confirm('Manually mark this payment PAID? This also marks its registration paid. Use only for verified offline/reconciled payments - it overrides the gateway record.')) return;
    setBusy(true);
    try {
      await api.patch<{ ok: true }>(`/api/admin/payments/${payId}/status`, { status: 'paid' });
      setData(await api.get<Response>(`/api/admin/registrations/${id}`));
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reverifyPayment(payId: string) {
    setBusy(true);
    try {
      const res = await api.post<{ status?: string; message?: string }>(`/api/admin/payments/${payId}/reverify`, {});
      alert(res.message || `Gateway status: ${res.status ?? 'unchanged'}.`);
      setData(await api.get<Response>(`/api/admin/registrations/${id}`));
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resendPaymentReceipt(payId: string) {
    setBusy(true);
    try {
      await api.post<{ ok: true }>(`/api/admin/payments/${payId}/resend-receipt`, {});
      alert('Payment receipt re-sent.');
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorPanel error={error} />;
  if (!data) return <div class="muted">Loading…</div>;

  const r = data.registration;
  // The user picks a payment row; the status + receipt actions then target THAT
  // row's registration. Default selection = this page's own registration.
  const sel = data.payments.find((p) => p.id === selPayId)
    ?? data.payments.find((p) => String(p.registration_id) === String(id))
    ?? data.payments[0]
    ?? null;
  const selRegId  = sel ? sel.registration_id : id;
  const selStatus = sel ? sel.reg_status : r.status;

  return (
    <>
      <div class="page-header">
        <a class="back-link" href={href('/registrations')} onClick={(e) => { e.preventDefault(); navigate('/registrations'); }}>
          ← Back to Registrations
        </a>
        <h1 style="margin-top:8px;">{r.student_full_name}</h1>
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
        <p class="cell-sub" style="margin:-4px 0 10px;">All payments for this guardian, across their registrations.</p>
        {data.payments.length === 0 ? (
          <p class="muted">No payment attempts yet.</p>
        ) : (
          <div class="table-wrap" style="margin-top:8px;">
            <table class="data-table">
              <thead>
                <tr>
                  <th aria-label="Select"></th><th>Status</th><th>For</th><th>Amount</th><th>Tran ID</th><th>Gateway</th><th>Coupon</th><th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr class={String(p.registration_id) === String(selRegId) ? 'is-current' : undefined}>
                    <td style="text-align:center;">
                      <input type="radio" name="paysel" checked={p.id === (sel ? sel.id : '')}
                        onChange={() => setSelPayId(p.id)} aria-label={`Act on ${p.program} registration`} />
                    </td>
                    <td><span class={`badge badge-${p.status === 'paid' ? 'ok' : p.status === 'failed' ? 'bad' : p.status === 'cancelled' ? 'muted' : 'warn'}`}>{p.status}</span></td>
                    <td class="cell-sub" style="white-space:nowrap;">{p.program} · {p.class_name}</td>
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
        <div class="action-row">
          {sel && sel.status !== 'paid' && (
            <button type="button" class="btn-secondary" disabled={busy} onClick={() => markPaymentPaid(sel.id)}>
              Mark paid
            </button>
          )}
          {sel && (
            <button type="button" class="btn-secondary" disabled={busy} onClick={() => reverifyPayment(sel.id)}>
              Re-verify
            </button>
          )}
          {sel && sel.status === 'paid' && (
            <button type="button" class="btn-secondary" disabled={busy} onClick={() => resendPaymentReceipt(sel.id)}>
              Resend receipt
            </button>
          )}
          {(['submitted', 'cancelled'] as const).map((s) => (
            <button
              type="button"
              class="btn-secondary"
              disabled={busy || selStatus === s}
              onClick={() => changeStatus(s, selRegId, selStatus)}
            >
              Mark {s}
            </button>
          ))}
          {!r.guardian_email_verified && (
            <button type="button" class="btn-secondary" disabled={busy} onClick={resendVerification}>
              Resend verification
            </button>
          )}
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
