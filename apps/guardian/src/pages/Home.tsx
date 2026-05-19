// Guardian landing page. Hits the existing /api/me payload which
// already returns account + all registrations (with latest payment
// joined). Renders KPI tiles, a verification nag if email isn't
// confirmed, and one card per registration.

import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../api';

type Registration = {
  id: string;
  registration_type: string;
  student_full_name: string;
  student_class_name: string;
  student_gender: string;
  student_school: string;
  student_district: string;
  status: 'submitted' | 'paid' | 'cancelled';
  created_at: string;
  payment_id: string | null;
  payment_status: 'pending' | 'paid' | 'failed' | null;
  payment_amount: number | null;
  tran_id: string | null;
  payment_date: string | null;
};

type Response = {
  ok: true;
  account: { fullName: string; email: string; role: string; emailVerified: boolean; memberId: string | null };
  registrations: Registration[];
};

const TYPE_LABEL: Record<string, string> = {
  'national-qualifying-round':      'National Qualifying Round',
  'national-qualifying-round-both': 'National Qualifying Round (Math + Science)',
  'national-quiz-competition':      'National Quiz Competition',
  'stem-foundation':                'STEM Foundation',
  'bdmso-preparatory':              'BdMSO Preparatory',
  'stem-masterclass':               'STEM Masterclass',
  'mock-test':                      'Mock Test',
  'lab-day':                        'Lab Day',
  'robotics-foundation':            'Robotics Foundation',
  'summer-camp':                    'SPSB Nature Camp',
  'winter-camp':                    'Winter Camp',
  'exchange-program':               'Exchange Program',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatBdt(n: number | null): string {
  if (n == null) return '—';
  return `৳ ${Number(n).toLocaleString('en-BD')}`;
}

type PaymentNotice = 'success' | 'cancelled' | 'failed';

function readPaymentNotice(): PaymentNotice | null {
  const v = new URLSearchParams(location.search).get('payment');
  return v === 'success' || v === 'cancelled' || v === 'failed' ? v : null;
}

export function Home() {
  const [data, setData]     = useState<Response | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [notice, setNotice] = useState<PaymentNotice | null>(() => readPaymentNotice());

  useEffect(() => {
    api.get<Response>('/api/me')
      .then(setData)
      .catch((err: ApiError) => setError(err.message));
  }, []);

  // Strip the ?payment= param from the URL once we've captured it, so a
  // refresh or back-nav doesn't keep flashing the banner.
  useEffect(() => {
    if (!notice) return;
    const url = new URL(location.href);
    url.searchParams.delete('payment');
    history.replaceState(null, '', url.toString());
  }, [notice]);

  if (error) return <div class="error">{error}</div>;
  if (!data) return <p class="muted">Loading…</p>;

  const regs = data.registrations;
  const paid    = regs.filter((r) => r.status === 'paid').length;
  const pending = regs.filter((r) => r.status === 'submitted').length;
  const owed = regs
    .filter((r) => r.status === 'submitted' && r.payment_status !== 'paid' && r.payment_amount)
    .reduce((sum, r) => sum + (r.payment_amount || 0), 0);

  return (
    <>
      <div class="page-header">
        <h1>Welcome, {data.account.fullName.split(' ')[0]}.</h1>
        <p class="sub">Here's everything tied to your account.</p>
      </div>

      {notice === 'success' && (
        <div class="alert alert-ok">
          <strong>Payment confirmed.</strong> Your registration is paid — your member ID and a receipt should be in your inbox within a minute.
          <button type="button" class="alert-close" onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
        </div>
      )}
      {notice === 'cancelled' && (
        <div class="alert">
          <strong>Payment cancelled.</strong> No charge was made. You can try again from the registration below.
          <button type="button" class="alert-close" onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
        </div>
      )}
      {notice === 'failed' && (
        <div class="alert alert-bad">
          <strong>Payment didn't go through.</strong> If money was deducted, contact <a href="mailto:hello@bdmso.org">hello@bdmso.org</a> with your transaction reference — otherwise just try again.
          <button type="button" class="alert-close" onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      {!data.account.emailVerified && (
        <div class="alert">
          <strong>Verify your email</strong> to keep your account secure and receive payment receipts.
          {' '}
          <a href={`mailto:${data.account.email}`}>Check your inbox</a>, or contact support if you didn't receive the link.
        </div>
      )}

      <div class="stat-row">
        <Stat label="Registrations"      value={String(regs.length)} />
        <Stat label="Paid"               value={String(paid)}    tone="ok" />
        <Stat label="Pending payment"    value={String(pending)} tone={pending > 0 ? 'warn' : 'muted'} />
        <Stat label="Outstanding (BDT)"  value={formatBdt(owed || 0)} tone={owed > 0 ? 'warn' : 'muted'} />
      </div>

      <h2 class="section-h2">Your registrations</h2>

      {regs.length === 0 ? (
        <div class="empty">
          <p>You haven't registered for any programs yet.</p>
          <p class="muted">
            Open the <a href="/programs">programs page</a> to find one that fits your child.
          </p>
        </div>
      ) : (
        <div class="reg-list">
          {regs.map((r) => (
            <article class="reg-card">
              <header class="reg-card-head">
                <div>
                  <div class="reg-card-program">
                    {TYPE_LABEL[r.registration_type] || r.registration_type}
                  </div>
                  <div class="reg-card-student">
                    {r.student_full_name} · {r.student_class_name} · {r.student_gender}
                  </div>
                </div>
                <span class={`badge badge-${r.status === 'paid' ? 'ok' : r.status === 'cancelled' ? 'muted' : 'warn'}`}>
                  {r.status}
                </span>
              </header>

              <div class="reg-card-body">
                <div class="reg-card-meta">
                  <div>
                    <span class="cell-sub">School</span>
                    <div>{r.student_school}</div>
                  </div>
                  <div>
                    <span class="cell-sub">District</span>
                    <div>{r.student_district}</div>
                  </div>
                  <div>
                    <span class="cell-sub">Registered</span>
                    <div>{formatDate(r.created_at)}</div>
                  </div>
                </div>

                <div class={`reg-card-payment ${r.payment_status === 'paid' ? 'paid' : r.status === 'submitted' ? 'pending' : 'muted'}`}>
                  {r.payment_status === 'paid' ? (
                    <>
                      <div class="reg-card-payment-label">Paid</div>
                      <div class="reg-card-payment-value">{formatBdt(r.payment_amount)}</div>
                      <div class="cell-sub">on {formatDate(r.payment_date)}</div>
                    </>
                  ) : r.payment_status === 'pending' ? (
                    <>
                      <div class="reg-card-payment-label">Awaiting payment</div>
                      <div class="reg-card-payment-value">{formatBdt(r.payment_amount)}</div>
                      <div class="cell-sub">
                        Started {formatDate(r.payment_date)} — tran <code>{r.tran_id?.slice(0, 12)}…</code>
                      </div>
                    </>
                  ) : r.status === 'cancelled' ? (
                    <>
                      <div class="reg-card-payment-label">Cancelled</div>
                      <div class="cell-sub">Contact support if you'd like to reactivate.</div>
                    </>
                  ) : (
                    <>
                      <div class="reg-card-payment-label">Payment due</div>
                      <div class="cell-sub">No payment attempt yet — head to the registration page to pay.</div>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'muted' }) {
  return (
    <div class={`stat${tone ? ` stat-${tone}` : ''}`}>
      <div class="stat-value">{value}</div>
      <div class="stat-label">{label}</div>
    </div>
  );
}
