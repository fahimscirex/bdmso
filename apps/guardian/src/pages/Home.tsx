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

// Local price map. Source of truth lives in worker/lib/programs.js — these
// values must agree. Kept here only so we can show the parent the amount
// inline; the server re-derives the actual charge from the same map.
// When programs CRUD migrates to D1, swap this for an /api/programs lookup.
const PROGRAM_PRICES: Record<string, number> = {
  'national-qualifying-round':      1000,
  'national-qualifying-round-both': 1500,
  'national-quiz-competition':      1000,
  'stem-foundation':                8000,
  'bdmso-preparatory':             12000,
  'stem-masterclass':               6000,
  'mock-test':                      3000,
  'lab-day':                        2000,
  'robotics-foundation':            7000,
  'summer-camp':                   15000,
  'winter-camp':                   25000,
  'exchange-program':              50000,
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
          {regs.map((r) => <RegistrationCard key={r.id} reg={r} />)}
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

// One registration row. Owns its own pay/coupon UI state so cards don't
// interfere with each other when a parent has multiple registrations.

type CouponInfo = { code: string; description: string; discountedAmount: number; free: boolean };

function RegistrationCard({ reg }: { reg: Registration }) {
  const basePrice  = reg.payment_amount ?? PROGRAM_PRICES[reg.registration_type] ?? null;
  const needsPay   = reg.status !== 'cancelled' && reg.payment_status !== 'paid';

  const [showCoupon, setShowCoupon]     = useState(false);
  const [couponInput, setCouponInput]   = useState('');
  const [coupon, setCoupon]             = useState<CouponInfo | null>(null);
  const [couponMsg, setCouponMsg]       = useState<{ text: string; ok: boolean } | null>(null);
  const [validating, setValidating]     = useState(false);
  const [paying, setPaying]             = useState(false);
  const [payError, setPayError]         = useState<string | null>(null);

  async function applyCoupon() {
    const code = couponInput.trim().toUpperCase();
    if (!code) {
      setCouponMsg({ text: 'Enter a coupon code first.', ok: false });
      return;
    }
    setValidating(true);
    setCouponMsg(null);
    try {
      const url = `/api/validate-coupon?code=${encodeURIComponent(code)}&type=${encodeURIComponent(reg.registration_type)}`;
      const res  = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid coupon');

      const discounted = data.discountType === 'percent'
        ? Math.round((basePrice ?? 0) * (1 - Number(data.discountValue) / 100))
        : Math.max(0, (basePrice ?? 0) - Number(data.discountValue));

      setCoupon({
        code,
        description: data.description,
        discountedAmount: discounted,
        free: discounted === 0,
      });
      setCouponMsg({ text: `✓ ${data.description} applied`, ok: true });
    } catch (err) {
      setCoupon(null);
      setCouponMsg({ text: (err as Error).message, ok: false });
    } finally {
      setValidating(false);
    }
  }

  async function payNow() {
    setPaying(true);
    setPayError(null);
    try {
      const body = { registrationId: reg.id, couponCode: coupon?.code || '' };
      const data = await api.post<{ ok: true; free?: boolean; checkoutURL?: string }>('/api/create-payment', body);
      if (data.free || !data.checkoutURL) {
        location.href = '/dashboard?payment=success';
        return;
      }
      location.href = data.checkoutURL;
    } catch (err) {
      setPayError((err as Error).message);
      setPaying(false);
    }
  }

  return (
    <article class="reg-card">
      <header class="reg-card-head">
        <div>
          <div class="reg-card-program">
            {TYPE_LABEL[reg.registration_type] || reg.registration_type}
          </div>
          <div class="reg-card-student">
            {reg.student_full_name} · {reg.student_class_name} · {reg.student_gender}
          </div>
        </div>
        <span class={`badge badge-${reg.status === 'paid' ? 'ok' : reg.status === 'cancelled' ? 'muted' : 'warn'}`}>
          {reg.status}
        </span>
      </header>

      <div class="reg-card-body">
        <div class="reg-card-meta">
          <div>
            <span class="cell-sub">School</span>
            <div>{reg.student_school}</div>
          </div>
          <div>
            <span class="cell-sub">District</span>
            <div>{reg.student_district}</div>
          </div>
          <div>
            <span class="cell-sub">Registered</span>
            <div>{formatDate(reg.created_at)}</div>
          </div>
        </div>

        <div class={`reg-card-payment ${reg.payment_status === 'paid' ? 'paid' : reg.status === 'submitted' ? 'pending' : 'muted'}`}>
          {reg.payment_status === 'paid' ? (
            <>
              <div class="reg-card-payment-label">Paid</div>
              <div class="reg-card-payment-value">{formatBdt(reg.payment_amount)}</div>
              <div class="cell-sub">on {formatDate(reg.payment_date)}</div>
            </>
          ) : reg.status === 'cancelled' ? (
            <>
              <div class="reg-card-payment-label">Cancelled</div>
              <div class="cell-sub">Contact support if you'd like to reactivate.</div>
            </>
          ) : (
            <>
              <div class="reg-card-payment-label">
                {reg.payment_status === 'pending' ? 'Awaiting payment' : 'Payment due'}
              </div>
              <div class="reg-card-payment-value">
                {coupon && basePrice != null ? (
                  <>
                    <s class="reg-card-payment-strike">{formatBdt(basePrice)}</s>{' '}
                    {coupon.free ? 'Free' : formatBdt(coupon.discountedAmount)}
                  </>
                ) : (
                  formatBdt(basePrice)
                )}
              </div>

              {reg.payment_status === 'pending' && (
                <div class="cell-sub" style="margin-bottom:10px;">
                  Last attempt didn't complete — try again below.
                </div>
              )}

              {needsPay && (
                <>
                  <button
                    type="button"
                    class="btn-primary reg-card-pay-btn"
                    disabled={paying || validating}
                    onClick={payNow}
                  >
                    {paying
                      ? 'Redirecting…'
                      : coupon?.free
                        ? 'Confirm free enrollment →'
                        : coupon
                          ? `Pay ${formatBdt(coupon.discountedAmount)} →`
                          : reg.payment_status === 'pending'
                            ? 'Try payment again →'
                            : 'Pay now →'}
                  </button>

                  {payError && <div class="reg-card-pay-error">{payError}</div>}

                  {!showCoupon ? (
                    <button
                      type="button"
                      class="reg-card-coupon-toggle"
                      onClick={() => setShowCoupon(true)}
                    >
                      Have a coupon?
                    </button>
                  ) : (
                    <div class="reg-card-coupon">
                      <input
                        type="text"
                        placeholder="Coupon code"
                        value={couponInput}
                        onInput={(e) => setCouponInput((e.target as HTMLInputElement).value.toUpperCase())}
                        disabled={validating || paying}
                      />
                      <button
                        type="button"
                        class="btn-secondary"
                        onClick={applyCoupon}
                        disabled={validating || paying || !couponInput.trim()}
                      >
                        {validating ? 'Checking…' : 'Apply'}
                      </button>
                    </div>
                  )}

                  {couponMsg && (
                    <div class={`reg-card-coupon-msg ${couponMsg.ok ? 'ok' : 'bad'}`}>
                      {couponMsg.text}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  );
}
