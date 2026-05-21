// Guardian landing page. Hits the existing /api/me payload which
// already returns account + all registrations (with latest payment
// joined). Renders KPI tiles, a verification nag if email isn't
// confirmed, and one card per registration.

import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../api';
import { syncSessionName, syncHeaderName } from '../auth';

type Registration = {
  id: string;
  registration_type: string;
  // program_label + program_price come from the worker's /api/me,
  // derived from the catalog (programs-detail.json) - the dashboard
  // never hard-codes program names or prices.
  program_label: string;
  program_price: number | null;
  student_full_name: string;
  student_class_name: string;
  student_gender: string;
  student_school: string;
  student_district: string;
  status: 'submitted' | 'paid' | 'cancelled';
  member_id: string | null;
  created_at: string;
  payment_id: string | null;
  payment_status: 'pending' | 'paid' | 'failed' | null;
  payment_amount: number | null;
  tran_id: string | null;
  payment_date: string | null;
  preferred_venue: string | null;
  preferred_subject: string | null;
};

type Response = {
  ok: true;
  account: { fullName: string; email: string; role: string; emailVerified: boolean; memberId: string | null };
  registrations: Registration[];
};

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatBdt(n: number | null): string {
  if (n == null) return '-';
  return `৳ ${Number(n).toLocaleString('en-BD')}`;
}

// Open a printable receipt for a paid registration in a new window
// and auto-trigger the browser's print dialog. The user can then
// print to paper or save as PDF via the OS print dialog.
//
// We build the HTML client-side from data already in hand rather than
// hitting a new worker endpoint - keeps the round-trip count down and
// avoids generating a PDF on the server.
function printReceipt(reg: Registration, account: { fullName: string; email: string; memberId: string | null }) {
  const programLabel = reg.program_label;
  const escape = (s: unknown) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const row = (label: string, value: string) =>
    `<div class="kv"><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`;
  const issuedISO = new Date().toISOString();
  const issuedLabel = new Date().toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  // Public-facing receipt number. The `BdMSO-` prefix keeps it
   // visually tied to the brand; the suffix is the last 8 chars of the
   // transaction (or row id) so it's unique without exposing internals.
  const receiptNo = `BdMSO-${(reg.tran_id || reg.id).slice(-8).toUpperCase()}`;

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<title>BdMSO Receipt - ${escape(receiptNo)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  :root {
    --navy-900: #0b1b3f;
    --navy-700: #1f3470;
    --gold:     #d4a017;
    --gold-light: #fcd34d;
    --green:    #1f7a4a;
    --green-bg: #ecfdf5;
    --ink-2:    #475569;
    --ink-3:    #6b7280;
    --line:     #e2e8f0;
    --line-2:   #f1f5f9;
  }
  body {
    font-family: 'Plus Jakarta Sans', -apple-system, Segoe UI, Roboto, sans-serif;
    color: var(--navy-900); margin: 0; padding: 40px 24px 24px;
    background: #f1f5f9;
    background-image:
      radial-gradient(circle at 12% 18%, rgba(252, 211, 77, 0.10), transparent 40%),
      radial-gradient(circle at 88% 82%, rgba(31, 52, 112, 0.08), transparent 50%);
    min-height: 100vh;
  }
  .actions { max-width: 660px; margin: 0 auto 16px; display: flex; gap: 10px; justify-content: flex-end; }
  .actions button {
    font: inherit; font-weight: 700; font-size: 13px;
    padding: 10px 18px; border-radius: 10px;
    border: 1px solid var(--line); background: white; color: var(--navy-900);
    cursor: pointer; display: inline-flex; align-items: center; gap: 8px;
    box-shadow: 0 1px 2px rgba(11, 27, 63, 0.04);
    transition: background 0.15s, border-color 0.15s;
  }
  .actions button:hover { border-color: var(--navy-700); }
  .actions button.primary { background: var(--navy-900); color: white; border-color: var(--navy-900); }
  .actions button.primary:hover { background: var(--navy-700); border-color: var(--navy-700); }

  /* Receipt sheet */
  .sheet {
    max-width: 660px; margin: 0 auto;
    background: white;
    border-radius: 18px;
    box-shadow: 0 24px 60px -28px rgba(11, 27, 63, 0.28);
    overflow: hidden;
    position: relative;
  }
  /* Vertical accent stripe on the left edge */
  .sheet::before {
    content: ""; position: absolute; left: 0; top: 0; bottom: 0;
    width: 6px;
    background: linear-gradient(180deg, var(--gold-light) 0%, var(--gold) 50%, var(--navy-700) 100%);
  }

  /* Header: brand mark on the left, receipt number on the right */
  .head {
    background: linear-gradient(135deg, var(--navy-900) 0%, var(--navy-700) 100%);
    color: white; padding: 28px 36px 32px 42px;
    display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
    position: relative; overflow: hidden;
  }
  .head::after {
    content: ""; position: absolute; right: -60px; top: -60px;
    width: 220px; height: 220px; border-radius: 50%;
    background: radial-gradient(circle, rgba(252, 211, 77, 0.18) 0%, transparent 70%);
    pointer-events: none;
  }
  .brand-logo { display: inline-block; background: #fff; border-radius: 8px; padding: 7px 11px; }
  .brand-logo img { display: block; height: 36px; width: auto; }
  .brand p  { margin: 8px 0 0; color: rgba(255, 255, 255, 0.78); font-size: 12.5px; font-weight: 500; }
  .receipt-no { text-align: right; position: relative; z-index: 1; }
  .receipt-no .l { font-size: 10px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: rgba(252, 211, 77, 0.85); }
  .receipt-no .v { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 15px; font-weight: 700; letter-spacing: 1px; margin-top: 4px; color: white; }
  .receipt-no .date { font-size: 11.5px; color: rgba(255, 255, 255, 0.7); margin-top: 4px; font-weight: 500; }

  /* Paid stamp - top-right rotated, semi-transparent */
  .paid-stamp {
    position: absolute; top: 110px; right: 32px;
    transform: rotate(-12deg);
    border: 3px solid var(--green);
    color: var(--green);
    padding: 6px 14px; border-radius: 6px;
    font-size: 14px; font-weight: 800; letter-spacing: 0.18em;
    text-transform: uppercase;
    background: rgba(236, 253, 245, 0.6);
    opacity: 0.85;
    z-index: 2;
  }

  /* BdMSO ID hero strip - the most prominent piece of info */
  .id-strip {
    background: linear-gradient(120deg, #fffbeb 0%, #fef3c7 100%);
    border-top: 1px solid rgba(252, 211, 77, 0.6);
    border-bottom: 1px solid rgba(252, 211, 77, 0.6);
    padding: 18px 36px 18px 42px;
    display: flex; justify-content: space-between; align-items: center; gap: 16px;
  }
  .id-strip .l { font-size: 11px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; color: #b45309; }
  .id-strip .v {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 22px; font-weight: 800; letter-spacing: 2px;
    color: var(--navy-900); margin-top: 4px;
  }
  .id-strip .right {
    text-align: right; font-size: 11.5px; color: var(--ink-2);
  }
  .id-strip .right .amount {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 1.6rem; font-weight: 800; color: var(--green); letter-spacing: -0.01em;
    margin-top: 2px;
  }

  /* Body sections */
  .body { padding: 28px 36px 32px 42px; }
  .section-label {
    font-size: 10.5px; font-weight: 800; letter-spacing: 0.14em;
    text-transform: uppercase; color: var(--ink-3);
    margin: 0 0 12px;
    display: flex; align-items: center; gap: 10px;
  }
  .section-label::before {
    content: ""; width: 16px; height: 2px; background: var(--gold); border-radius: 2px;
  }
  .program-pill {
    display: inline-flex; align-items: center; gap: 8px;
    background: var(--navy-900); color: white;
    padding: 6px 14px; border-radius: 999px;
    font-size: 13px; font-weight: 700;
    margin-bottom: 24px;
  }
  .program-pill::before {
    content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--gold-light);
  }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 28px; margin: 0 0 22px; }
  .kv dt {
    font-size: 10.5px; font-weight: 700; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--ink-3); margin-bottom: 3px;
  }
  .kv dd { margin: 0; font-size: 14px; font-weight: 600; color: var(--navy-900); word-break: break-word; }

  /* Payment summary box */
  .summary {
    background: var(--green-bg);
    border: 1px solid #bbf7d0;
    border-radius: 12px;
    padding: 18px 22px;
    margin-top: 8px;
    display: grid; grid-template-columns: 1fr auto; gap: 4px 16px;
    align-items: center;
  }
  .summary .l { font-size: 11px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: var(--green); }
  .summary .v { font-size: 1.6rem; font-weight: 800; color: var(--green); letter-spacing: -0.01em; font-family: 'Plus Jakarta Sans', sans-serif; }
  .summary .sub { font-size: 12px; color: var(--ink-2); grid-column: 1 / -1; margin-top: 2px; }
  .summary .tran {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11.5px; color: var(--ink-2);
    background: rgba(255, 255, 255, 0.6);
    padding: 2px 8px; border-radius: 4px;
    margin-left: 4px;
  }

  /* Footer */
  .foot {
    padding: 18px 36px 26px 42px;
    border-top: 1px dashed var(--line);
    background: linear-gradient(180deg, transparent 0%, rgba(241, 245, 249, 0.5) 100%);
  }
  .foot p { margin: 0; color: var(--ink-2); font-size: 11.5px; line-height: 1.6; }
  .foot .sig {
    display: flex; justify-content: space-between; align-items: center;
    margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--line-2);
    font-size: 11px; color: var(--ink-3);
  }
  .foot .sig strong { color: var(--navy-900); font-weight: 700; }

  /* Print refinements: drop shadows, drop the page bg, hide action bar. */
  @media print {
    body { background: white; padding: 0; background-image: none; }
    .sheet { box-shadow: none; border-radius: 0; max-width: none; }
    .actions { display: none; }
    .head { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .id-strip, .summary, .paid-stamp { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
  @media (max-width: 580px) {
    body { padding: 20px 14px; }
    .head, .id-strip, .body, .foot { padding-left: 24px; padding-right: 24px; }
    .grid { grid-template-columns: 1fr; }
    .receipt-no { text-align: left; margin-top: 8px; }
    .head { flex-direction: column; align-items: flex-start; }
    .paid-stamp { top: 90px; right: 18px; font-size: 12px; }
  }
</style>
</head><body>
  <div class="actions">
    <button type="button" onclick="window.print()" class="primary">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Print / Save as PDF
    </button>
    <button type="button" onclick="window.close()">Close</button>
  </div>

  <div class="sheet">
    <div class="head">
      <div class="brand">
        <span class="brand-logo"><img src="${location.origin}/images/logo.webp" alt="BdMSO" /></span>
        <p>Bangladesh Mathematics &amp; Science Olympiad</p>
      </div>
      <div class="receipt-no">
        <div class="l">Receipt No.</div>
        <div class="v">${escape(receiptNo)}</div>
        <div class="date">Issued ${escape(issuedLabel)}</div>
      </div>
    </div>

    <div class="paid-stamp">Paid</div>

    ${account.memberId ? `
      <div class="id-strip">
        <div>
          <div class="l">BdMSO ID</div>
          <div class="v">${escape(account.memberId)}</div>
        </div>
        <div class="right">
          <div>Amount paid</div>
          <div class="amount">${escape(formatBdt(reg.payment_amount))}</div>
        </div>
      </div>` : ''}

    <div class="body">
      <div class="program-pill">${escape(programLabel)}</div>

      <div class="section-label">Student</div>
      <div class="grid">
        ${row('Full name', reg.student_full_name)}
        ${row('Class', reg.student_class_name)}
        ${row('School', reg.student_school)}
        ${row('District', reg.student_district)}
      </div>

      <div class="section-label">Guardian</div>
      <div class="grid">
        ${row('Name', account.fullName)}
        ${row('Email', account.email)}
      </div>

      <div class="section-label">Payment</div>
      <div class="summary">
        <div>
          <div class="l">Total paid</div>
          <div class="sub">${escape(formatDate(reg.payment_date))}${reg.tran_id ? ` · <span class="tran">TXN ${escape(reg.tran_id)}</span>` : ''}</div>
        </div>
        <div class="v">${escape(formatBdt(reg.payment_amount))}</div>
      </div>
    </div>

    <div class="foot">
      <p>This is an electronic receipt for your BdMSO registration. Please retain it for your records; you may be asked to show it on examination day. For any questions or corrections, email <strong>hello@bdmso.org</strong> and quote your BdMSO ID.</p>
      <p><strong>Refund policy:</strong> only the amount remaining after applicable tax is refundable, and any refund request must be made within 24 hours of payment.</p>
      <div class="sig">
        <div><strong>BdMSO</strong> · bdmso.org</div>
        <div>Generated ${escape(issuedISO.slice(0, 10))}</div>
      </div>
    </div>
  </div>

  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 250));</script>
</body></html>`;

  const win = window.open('', '_blank', 'width=720,height=900');
  if (!win) {
    alert('Please allow pop-ups for this site to download the receipt.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

type PaymentNotice = 'success' | 'cancelled' | 'failed';

function readPaymentNotice(): PaymentNotice | null {
  const v = new URLSearchParams(location.search).get('payment');
  return v === 'success' || v === 'cancelled' || v === 'failed' ? v : null;
}

type StatFilter = 'all' | 'paid' | 'pending' | 'cancelled';

export function Home() {
  const [data, setData]     = useState<Response | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [notice, setNotice] = useState<PaymentNotice | null>(() => readPaymentNotice());
  const [statFilter, setStatFilter] = useState<StatFilter>('all');
  const [idFlipped, setIdFlipped]   = useState(false);

  function reload() {
    api.get<Response>('/api/me')
      .then((d) => {
        setData(d);
        // Keep the cached guardian name fresh, and show the registered
        // student's name in the site header.
        syncSessionName(d.account.fullName, d.account.email);
        const studentName = d.registrations.find((r) => r.status === 'paid')?.student_full_name
          || d.registrations[0]?.student_full_name;
        if (studentName) syncHeaderName(studentName);
      })
      .catch((err: ApiError) => setError(err.message));
  }
  useEffect(reload, []);

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

  // Sort: paid → submitted → cancelled, then most recent first. Paid
  // cards are the "trophy" cards (receipt + member ID), so they sit
  // at the top of the grid where the parent's eye lands first.
  const statusOrder = (s: Registration['status']) =>
    s === 'paid' ? 0 : s === 'submitted' ? 1 : 2;
  const regs = [...data.registrations].sort((a, b) => {
    const d = statusOrder(a.status) - statusOrder(b.status);
    if (d !== 0) return d;
    return (b.created_at || '').localeCompare(a.created_at || '');
  });
  const paid      = regs.filter((r) => r.status === 'paid').length;
  const pending   = regs.filter((r) => r.status === 'submitted').length;
  const cancelled = regs.filter((r) => r.status === 'cancelled').length;

  // The BdMSO ID belongs to the account (one student per account) and
  // is minted on the first paid receipt.
  const studentMemberId = data.account.memberId || null;

  // The hero ID card represents the student. Prefer a paid registration
  // (the "official" record) and fall back to the most recent one.
  const idStudent = regs.find((r) => r.status === 'paid') || regs[0] || null;

  // Apply the active stat filter to the registration list.
  const shownRegs = regs.filter((r) =>
    statFilter === 'all' ? true
    : statFilter === 'paid' ? r.status === 'paid'
    : statFilter === 'cancelled' ? r.status === 'cancelled'
    : r.status === 'submitted',
  );
  // The dashboard addresses the student (the candidate), not the
  // guardian. Falls back to the guardian's name only if no registration
  // exists yet to read a student name from.
  const firstName = (idStudent?.student_full_name || data.account.fullName).split(' ')[0];

  return (
    <>
      {notice === 'success' && (
        <div class="alert alert-ok">
          <strong>Payment confirmed.</strong> Your registration is paid - your BdMSO ID and a receipt should be in your inbox within a minute.
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
          <strong>Payment didn't go through.</strong> If money was deducted, contact <a href="mailto:hello@bdmso.org">hello@bdmso.org</a> with your transaction reference - otherwise just try again.
          <button type="button" class="alert-close" onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      {/* ── Hero: greeting + virtual student ID card ──────────────── */}
      <section class="dash-hero">
        <div class="dash-hero-text">
          <span class="dash-hero-pill">BdMSO Guardian Portal · 2026</span>
          <h1>Welcome back, {firstName}.</h1>
          <p>
            Everything tied to your account in one place - track registrations,
            clear pending payments, download receipts and explore new programs.
          </p>
          {!data.account.emailVerified && (
            <VerifyEmailNotice email={data.account.email} />
          )}
        </div>

        {idStudent ? (
          <button
            type="button"
            class={`id-card${idFlipped ? ' is-flipped' : ''}`}
            onClick={() => setIdFlipped((v) => !v)}
            title="Tap to flip"
          >
            <div class="id-card-face id-card-front">
              <div class="id-card-name-block">
                <span class="id-card-label">Registered Candidate</span>
                <span class="id-card-name">{idStudent.student_full_name}</span>
              </div>
              <div class="id-card-foot">
                <div>
                  <span class="id-card-label">BdMSO ID</span>
                  <span class="id-card-id">{studentMemberId || 'Pending payment'}</span>
                </div>
                <span class="id-card-class">{idStudent.student_class_name}</span>
              </div>
            </div>
            <div class="id-card-face id-card-back">
              <span class="id-card-label">Candidate verification</span>
              <div class="id-card-barcode" aria-hidden="true">
                {Array.from({ length: 28 }).map((_, i) => (
                  <span key={i} style={`width:${1 + (i % 4)}px`} />
                ))}
              </div>
              <p class="id-card-back-note">
                Present this BdMSO ID at regional centres to confirm your candidate record.
              </p>
            </div>
          </button>
        ) : (
          <div class="id-card id-card--empty">
            <p>Your student ID card appears here once you register.</p>
          </div>
        )}
      </section>

      {/* ── Stat filters ──────────────────────────────────────────── */}
      <div class="stat-row">
        <Stat label="All registrations" value={String(regs.length)} icon="reg"
              active={statFilter === 'all'} onClick={() => setStatFilter('all')} />
        <Stat label="Paid" value={String(paid)} tone="ok" icon="paid"
              active={statFilter === 'paid'} onClick={() => setStatFilter('paid')} />
        <Stat label="Payment pending" value={String(pending)} tone={pending > 0 ? 'warn' : 'muted'} icon="pending"
              active={statFilter === 'pending'} onClick={() => setStatFilter('pending')} />
        <Stat label="Cancelled" value={String(cancelled)} tone="muted" icon="cancelled"
              active={statFilter === 'cancelled'} onClick={() => setStatFilter('cancelled')} />
      </div>

      {/* ── Registrations (left) + sidebar (right) ────────────────── */}
      <div class="dash-grid">
        <div class="dash-grid-main">
          <div class="dash-section-head" id="your-registrations">
            <h2 class="section-h2">Your registrations</h2>
            {statFilter !== 'all' && (
              <button type="button" class="dash-clear-filter" onClick={() => setStatFilter('all')}>
                Clear filter
              </button>
            )}
          </div>

          {regs.length === 0 ? (
            <div class="empty">
              <p>You haven't registered for any programs yet.</p>
              <p class="muted">
                Open the <a href="/programs">programs page</a> to find one that fits your child.
              </p>
            </div>
          ) : shownRegs.length === 0 ? (
            <div class="empty">
              <p>No {statFilter} registrations.</p>
              <button type="button" class="dash-clear-filter" onClick={() => setStatFilter('all')}>
                Show all registrations
              </button>
            </div>
          ) : (
            <div class="reg-list">
              {shownRegs.map((r) => (
                <RegistrationCard key={r.id} reg={r} account={data.account} onChanged={reload} />
              ))}
            </div>
          )}
        </div>

        <aside class="dash-grid-side">
          <DashboardChecklist
            emailVerified={data.account.emailVerified}
            paidCount={paid}
            pendingCount={pending}
            hasMemberId={!!studentMemberId}
          />
          <ImportantDates />
        </aside>
      </div>

      <ExploreOtherPrograms registered={new Set(regs.map((r) => r.registration_type))} />
    </>
  );
}

// Email-verification nag in the dashboard hero. The verification email
// can go missing (spam, typo'd address, blocked sender), so this offers
// a one-click resend wired to POST /api/resend-verification.
function VerifyEmailNotice({ email }: { email: string }) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  async function resend() {
    setStatus('sending');
    try {
      const res = await api.post<{ ok: true; alreadyVerified?: boolean }>('/api/resend-verification', {});
      setStatus('sent');
      setMsg(res.alreadyVerified
        ? 'Your email is already verified - refresh the page.'
        : `Verification email sent to ${email}. Check your inbox and spam folder.`);
    } catch (err) {
      setStatus('error');
      setMsg(err instanceof ApiError ? err.message : 'Could not send right now - try again shortly.');
    }
  }

  if (status === 'sent') {
    return (
      <div class="dash-hero-verify is-sent">
        <span class="dot" /> {msg}
      </div>
    );
  }

  return (
    <div class="dash-hero-verify">
      <span class="dot" />
      <span>Verify your email to receive receipts &amp; admit cards.</span>
      <button
        type="button"
        class="dash-hero-verify-btn"
        onClick={resend}
        disabled={status === 'sending'}
      >
        {status === 'sending' ? 'Sending…' : 'Resend email'}
      </button>
      {status === 'error' && <span class="dash-hero-verify-err">{msg}</span>}
    </div>
  );
}

// Right-rail checklist - reflects the guardian's real account state so
// it reads as live progress, not static marketing copy.
function DashboardChecklist({ emailVerified, paidCount, pendingCount, hasMemberId }: {
  emailVerified: boolean; paidCount: number; pendingCount: number; hasMemberId: boolean;
}) {
  const items = [
    { done: true, label: 'Account created', sub: 'Guardian portal access is active' },
    { done: emailVerified, label: 'Email verified', sub: emailVerified ? 'Receipts will reach your inbox' : 'Check your inbox for the link' },
    { done: paidCount > 0, label: 'First payment cleared', sub: pendingCount > 0 ? `${pendingCount} registration${pendingCount === 1 ? '' : 's'} awaiting payment` : 'All registrations are paid' },
    { done: hasMemberId, label: 'BdMSO ID issued', sub: hasMemberId ? 'Use it across every program' : 'Issued on your first paid receipt' },
  ];
  return (
    <section class="side-card">
      <h3 class="side-card-title">Your checklist</h3>
      <ul class="checklist">
        {items.map((it) => (
          <li key={it.label} class={`checklist-item${it.done ? ' is-done' : ''}`}>
            <span class="checklist-mark" aria-hidden="true">{it.done ? '✓' : '!'}</span>
            <span class="checklist-text">
              <span class="checklist-label">{it.label}</span>
              <span class="checklist-sub">{it.sub}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// "Important dates" - pulled from the marketing site's Road-to-IMSO
// steps.json so the dashboard and the public timeline never disagree.
function ImportantDates() {
  const [steps, setSteps] = useState<{ name: string; date: string }[] | null>(null);
  useEffect(() => {
    fetch('/data/steps.json')
      .then((r) => (r.ok ? r.json() : []))
      .then(setSteps)
      .catch(() => setSteps([]));
  }, []);
  if (!steps || steps.length === 0) return null;
  return (
    <section class="side-card">
      <h3 class="side-card-title">Key dates</h3>
      <ul class="datelist">
        {steps.slice(0, 5).map((s, i) => (
          <li key={i} class="datelist-item">
            <span class="datelist-date">{s.date}</span>
            <span class="datelist-name">{s.name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Surfaces year-round programs a guardian hasn't already signed up for,
// so the dashboard doesn't feel like a dead-end after the first registration.
// Links go to the marketing /programs page - single origin in prod, Vite-
// proxied to the worker in dev. Filtering by "already registered" so we
// don't dangle suggestions for things the parent has already paid for.
type ProgramDetail = {
  slug: string;
  title: string;
  tagline?: string;
  audience?: string;
  home_order?: string;
  registration?: boolean;
  hidden?: boolean;
};

function ExploreOtherPrograms({ registered }: { registered: Set<string> }) {
  const [programs, setPrograms] = useState<ProgramDetail[] | null>(null);

  useEffect(() => {
    fetch('/data/programs-detail.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : []))
      .then(setPrograms)
      .catch(() => setPrograms([]));
  }, []);

  if (!programs) return null;

  // A program is "open for registration" when registration isn't
  // explicitly closed and it isn't hidden - both controlled from
  // programs-detail.json. We don't filter by "already registered"
  // because a parent may want to enroll another child or re-enroll
  // after a cancel; the per-program page handles that UX.
  void registered;
  const openPrograms = programs.filter(
    (p) => p.registration !== false && !p.hidden,
  );

  return (
    <>
      <h2 class="section-h2">Explore Other Available Programs</h2>
      <div class="explore-grid">
        {openPrograms.map((p) => (
          <a class="explore-card" href={`/programs/${p.slug}`} key={p.slug}>
            {p.audience && <div class="explore-card-eyebrow">{p.audience}</div>}
            <div class="explore-card-title">{p.title}</div>
            {p.tagline && <p class="explore-card-desc">{p.tagline}</p>}
            <div class="explore-card-foot">Learn more →</div>
          </a>
        ))}
        {/* "Explore all" CTA lives in-grid as the final card so the
            section reads as a balanced row of cards instead of a card
            grid plus a stray button below. */}
        <a class="explore-card explore-card-all" href="/programs">
          <div class="explore-card-eyebrow">All programs</div>
          <div class="explore-card-title">Explore the full catalog</div>
          <p class="explore-card-desc">Upcoming intakes, year-round courses, residential camps and the international exchange.</p>
          <div class="explore-card-foot">Open catalog →</div>
        </a>
      </div>
      {openPrograms.length === 0 && (
        <p class="muted" style="margin: -8px 0 24px;">
          Nothing's open for registration right now. Browse the full catalog for what's coming next.
        </p>
      )}
    </>
  );
}

type StatIcon = 'reg' | 'paid' | 'pending' | 'money' | 'cancelled';
function Stat({ label, value, tone, icon, active, onClick }: {
  label: string; value: string; tone?: 'ok' | 'warn' | 'muted'; icon?: StatIcon;
  active?: boolean; onClick?: () => void;
}) {
  const cls = ['stat', tone && `stat-${tone}`, icon && `stat-icon-${icon}`, active && 'is-active']
    .filter(Boolean).join(' ');
  return (
    <button type="button" class={cls} onClick={onClick} aria-pressed={!!active}>
      <div class="stat-value">{value}</div>
      <div class="stat-label">{label}</div>
    </button>
  );
}

// One registration row. Owns its own pay/coupon UI state so cards don't
// interfere with each other when a parent has multiple registrations.

type CouponInfo = { code: string; description: string; discountedAmount: number; free: boolean };

type AccountInfo = Response['account'];

function RegistrationCard({ reg, account, onChanged }: { reg: Registration; account: AccountInfo; onChanged: () => void }) {
  const basePrice  = reg.payment_amount ?? reg.program_price;
  // "On enquiry" programs (Masterclass, Kids AI, camps, Exchange) have
  // no fixed price - skip the Pay Now flow and surface a contact-us
  // line so the parent isn't stuck on a broken button.
  const onEnquiry  = basePrice === null;
  const needsPay   = reg.status !== 'cancelled' && reg.payment_status !== 'paid' && !onEnquiry;
  const canCancel  = reg.status === 'submitted';
  const [cancelling, setCancelling]     = useState(false);
  const [cancelError, setCancelError]   = useState<string | null>(null);

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

  async function cancelRegistration() {
    if (!confirm(`Cancel "${reg.program_label}" for ${reg.student_full_name}? This can't be undone here - you'll need to register again to re-enroll.`)) {
      return;
    }
    setCancelling(true);
    setCancelError(null);
    try {
      await api.post<{ ok: true }>(`/api/me/registrations/${reg.id}/cancel`, {});
      onChanged();
    } catch (err) {
      setCancelError((err as Error).message);
    } finally {
      setCancelling(false);
    }
  }

  const sideClass =
    reg.payment_status === 'paid' ? 'paid'
    : reg.status === 'cancelled' ? 'muted'
    : onEnquiry ? 'muted'
    : 'pending';

  return (
    <article class="reg-card">
      {/* Left: program title, student, fact strip */}
      <div class="reg-card-main">
        <div class="reg-card-head">
          <h3 class="reg-card-program">
            {reg.program_label}
          </h3>
          <span class={`badge badge-${reg.status === 'paid' ? 'ok' : reg.status === 'cancelled' ? 'muted' : 'warn'}`}>
            {reg.status}
          </span>
        </div>
        <div class="reg-card-student">
          {reg.student_full_name} · {reg.student_class_name}
          {reg.student_gender ? ` · ${reg.student_gender}` : ''}
        </div>

        <div class="reg-card-facts">
          <div class="reg-fact"><span class="k">Registered</span><span class="v">{formatDate(reg.created_at)}</span></div>
          {reg.payment_status === 'paid' && reg.payment_date && (
            <div class="reg-fact"><span class="k">Paid on</span><span class="v">{formatDate(reg.payment_date)}</span></div>
          )}
          {reg.payment_status === 'paid' && reg.tran_id && (
            <div class="reg-fact"><span class="k">Txn ID</span><span class="v mono">{reg.tran_id.slice(-12).toUpperCase()}</span></div>
          )}
        </div>

      </div>

      {/* Middle: payment details - status, amount, coupon, cancel */}
      <div class={`reg-card-side ${sideClass}`}>
        {reg.payment_status === 'paid' ? (
          <>
            <span class="reg-card-side-label">Paid</span>
            <div class="reg-card-side-amount">{formatBdt(reg.payment_amount)}</div>
            {reg.payment_date && (
              <div class="reg-card-side-sub">on {formatDate(reg.payment_date)}</div>
            )}
          </>
        ) : reg.status === 'cancelled' ? (
          <>
            <span class="reg-card-side-label">Cancelled</span>
            <div class="reg-card-side-sub">Re-register from the programs page to re-enroll.</div>
          </>
        ) : onEnquiry ? (
          <>
            <span class="reg-card-side-label">On enquiry</span>
            <div class="reg-card-side-sub">Fee is set per cohort - our team will email you.</div>
            {canCancel && (
              <button
                type="button"
                class="reg-card-foot-link danger"
                disabled={cancelling}
                onClick={cancelRegistration}
              >
                {cancelling ? 'Cancelling…' : 'Cancel registration'}
              </button>
            )}
            {cancelError && <span class="reg-card-coupon-msg bad">{cancelError}</span>}
          </>
        ) : (
          <>
            <span class="reg-card-side-label">
              {reg.payment_status === 'pending' ? 'Payment incomplete' : 'Payment due'}
            </span>
            <div class="reg-card-side-amount">
              {coupon && basePrice != null ? (
                <>
                  <s class="reg-card-payment-strike">{formatBdt(basePrice)}</s>{' '}
                  {coupon.free ? 'Free' : formatBdt(coupon.discountedAmount)}
                </>
              ) : (
                formatBdt(basePrice)
              )}
            </div>
            {showCoupon ? (
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
                  {validating ? '…' : 'Apply'}
                </button>
              </div>
            ) : (
              <button type="button" class="reg-card-foot-link" onClick={() => setShowCoupon(true)}>
                Have a coupon?
              </button>
            )}
            {couponMsg && (
              <span class={`reg-card-coupon-msg ${couponMsg.ok ? 'ok' : 'bad'}`}>{couponMsg.text}</span>
            )}
            {canCancel && (
              <button
                type="button"
                class="reg-card-foot-link danger"
                disabled={cancelling || paying}
                onClick={cancelRegistration}
              >
                {cancelling ? 'Cancelling…' : 'Cancel registration'}
              </button>
            )}
            {cancelError && <span class="reg-card-coupon-msg bad">{cancelError}</span>}
          </>
        )}
      </div>

      {/* Right: the single primary action, alone. Cancelled rows have
          no action - the middle column already explains how to re-enroll. */}
      {reg.status !== 'cancelled' && (needsPay || reg.payment_status === 'paid' || onEnquiry) && (
        <div class={`reg-card-action ${sideClass}`}>
          {reg.payment_status === 'paid' ? (
            <button
              type="button"
              class="reg-card-receipt-btn"
              onClick={() => printReceipt(reg, account)}
            >
              Download Receipt
            </button>
          ) : onEnquiry ? (
            <a
              class="reg-card-receipt-btn reg-card-contact-btn"
              href={`mailto:hello@bdmso.org?subject=${encodeURIComponent(`Fee enquiry - ${reg.program_label}`)}`}
            >
              Contact us
            </a>
          ) : (
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
                    ? 'Confirm enrollment →'
                    : coupon
                      ? `Pay ${formatBdt(coupon.discountedAmount)} →`
                      : reg.payment_status === 'pending'
                        ? 'Try again →'
                        : 'Pay now →'}
              </button>
              {payError && <div class="reg-card-pay-error">{payError}</div>}
            </>
          )}
        </div>
      )}
    </article>
  );
}
