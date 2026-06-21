// Guardian landing page. Hits the existing /api/me payload which
// already returns account + all registrations (with latest payment
// joined). Renders KPI tiles, a verification nag if email isn't
// confirmed, and one card per registration.

import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../api';
import { syncSessionName, syncHeaderName } from '../auth';
import ChangeSelectionModal from '../components/ChangeSelectionModal';
import type { OptionsConfig } from '../components/ChangeSelectionModal';
import { loadMe, type ExamResult } from '../me';
import DashboardSkeleton from '../components/DashboardSkeleton';
import { ErrorPanel } from '../components/ErrorPanel';
import { formatBdt, formatDate } from '../format';

type Registration = {
  id: string;
  registration_type: string;
  // program_label + program_price come from the worker's /api/me,
  // derived from the catalog (programs-detail.json) - the dashboard
  // never hard-codes program names or prices.
  program_label: string;
  option_labels?: string[];
  // Raw stored option ids (JSON-stringified array). options_config +
  // edit_window_open are inlined by /api/me so the edit modal can
  // render without a second fetch.
  program_options: string | null;
  options_config: OptionsConfig | null;
  // True while today <= registrationEnds for this program. Gates every
  // guardian-initiated edit (options + subject + venue) - one window
  // per program, no separate fields.
  edit_window_open: boolean;
  // Date metadata used by the "Key dates" rail. ISO yyyy-mm-dd strings
  // or null; populated from the catalog by /api/me.
  registration_ends: string | null;
  starts_on: string | null;
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
  payment_amount: number | null;     // initial payment amount (excludes top-ups)
  total_paid: number;                 // cumulative across initial + every option-upgrade
  tran_id: string | null;
  payment_date: string | null;
  payment_method: string | null;
  preferred_venue: string | null;
  preferred_subject: string | null;
  // Published exam results (one per published run; empty until released).
  // Attached by /api/me only for events with results_published = 1.
  results: ExamResult[];
};

type Response = {
  ok: true;
  account: { fullName: string; email: string; role: string; emailVerified: boolean; memberId: string | null };
  registrations: Registration[];
};

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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  :root {
    --navy:  #15233f;
    --ink:   #5b6573;
    --muted: #9aa1ad;
    --line:  #e8eaef;
    --green: #15803d;
    --sheet: #f3f4f7;
    --mono:  ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  body {
    font-family: 'IBM Plex Sans', -apple-system, Segoe UI, Roboto, sans-serif;
    color: var(--navy); margin: 0; padding: 40px 20px;
    background: linear-gradient(170deg, #eceef2 0%, #e0e3ea 100%);
    -webkit-font-smoothing: antialiased;
    font-feature-settings: 'tnum' 1;
  }

  /* Action bar (screen only) */
  .actions { max-width: 640px; margin: 0 auto 16px; display: flex; gap: 10px; justify-content: flex-end; }
  .actions button {
    font: inherit; font-weight: 600; font-size: 13px;
    padding: 9px 18px; border-radius: 9px;
    border: 1px solid #d4d8e0; background: white; color: var(--navy);
    cursor: pointer; display: inline-flex; align-items: center; gap: 7px;
  }
  .actions button:hover { border-color: var(--navy); }
  .actions button.primary { background: var(--navy); color: white; border-color: var(--navy); }

  /* Receipt sheet - inner white cards float on this light surface */
  .sheet {
    max-width: 640px; margin: 0 auto; background: var(--sheet);
    border-radius: 20px; padding: 34px 32px 26px;
    box-shadow: 0 28px 56px -30px rgba(21, 35, 63, 0.40);
  }

  /* Header: logo + document label on the left, QR code on the right */
  .r-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
  .r-logo { height: 42px; width: auto; display: block; }
  .r-doc { margin-top: 16px; font-size: 12px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted); }
  .r-rno { margin-top: 4px; font-family: var(--mono); font-size: 14px; font-weight: 600; color: var(--navy); letter-spacing: 0.02em; }
  /* Hero amount */
  .r-hero { margin: 22px 0 24px; }
  .r-hero-amt { font-size: 38px; font-weight: 700; letter-spacing: -0.025em; line-height: 1; color: var(--navy); }
  .r-hero-amt span { font-size: 19px; font-weight: 600; color: var(--green); margin-left: 5px; letter-spacing: 0; }
  .r-hero-sub { margin-top: 10px; font-size: 13px; color: var(--ink); }

  /* Inner cards */
  .r-card {
    background: white; border: 1px solid var(--line); border-radius: 13px;
    box-shadow: 0 6px 16px -12px rgba(21, 35, 63, 0.22);
    padding: 20px 22px; margin-bottom: 16px;
  }
  .r-card-h {
    font-size: 11px; font-weight: 700; letter-spacing: 0.13em; text-transform: uppercase;
    color: var(--muted); margin-bottom: 14px;
  }

  /* Detail rows */
  .r-dl { margin: 0; }
  .r-line {
    display: flex; justify-content: space-between; align-items: baseline; gap: 20px;
    padding: 8px 0; border-bottom: 1px solid var(--line);
  }
  .r-line:last-child { border-bottom: none; padding-bottom: 0; }
  .r-line dt { font-size: 12.5px; color: var(--ink); font-weight: 500; flex-shrink: 0; }
  .r-line dd { margin: 0; font-size: 13px; font-weight: 600; color: var(--navy); text-align: right; word-break: break-word; }
  .r-line dd.mono { font-family: var(--mono); font-size: 12px; font-weight: 500; }

  /* Line item + total */
  .r-item { display: flex; justify-content: space-between; gap: 20px; padding-bottom: 14px; }
  .r-item-name { font-size: 14.5px; font-weight: 700; color: var(--navy); }
  .r-item-sub { margin-top: 4px; font-size: 12px; color: var(--muted); line-height: 1.5; }
  .r-item-amt { font-size: 14.5px; font-weight: 700; color: var(--navy); white-space: nowrap; }
  .r-total {
    display: flex; justify-content: space-between; align-items: center;
    border-top: 1.5px solid var(--navy); padding-top: 13px;
  }
  .r-total span:first-child { font-size: 13px; font-weight: 700; color: var(--navy); }
  .r-total span:last-child  { font-size: 19px; font-weight: 700; color: var(--navy); letter-spacing: -0.01em; }

  /* Note */
  .r-note { padding: 6px 4px 0; }
  .r-note p { margin: 0 0 7px; font-size: 11px; line-height: 1.65; color: var(--ink); }
  .r-note p:last-child { margin-bottom: 0; }
  .r-note strong { color: var(--navy); font-weight: 600; }

  /* Footer */
  .r-foot {
    display: flex; justify-content: space-between; align-items: flex-end; gap: 24px;
    margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--line);
  }
  .r-foot-org { font-size: 10.5px; line-height: 1.6; color: var(--muted); }
  .r-foot-org strong { display: block; color: var(--navy); font-size: 11.5px; font-weight: 700; margin-bottom: 3px; }
  .r-foot-help { font-size: 11.5px; color: var(--ink); text-align: right; }
  .r-foot-help strong { color: var(--navy); font-weight: 700; }

  @media print {
    body { background: white; padding: 0; }
    .sheet { box-shadow: none; border-radius: 0; max-width: none; background: white; padding: 24px; }
    .actions { display: none; }
    .r-card { box-shadow: none; }
    .r-hero-amt span { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
  @media (max-width: 560px) {
    body { padding: 18px 12px; }
    .sheet { padding: 24px 18px 20px; }
    .r-item { flex-direction: column; gap: 6px; }
    .r-item-amt { text-align: left; }
    .r-foot { flex-direction: column; align-items: flex-start; }
    .r-foot-help { text-align: left; }
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
    <div class="r-head">
      <div>
        <img class="r-logo" src="${location.origin}/images/logo.webp" alt="BdMSO" />
        <div class="r-doc">Payment Receipt</div>
        <div class="r-rno">${escape(receiptNo)}</div>
        <div style="margin-top:4px;font-size:11px;color:var(--muted);">Issued ${escape(issuedLabel)}</div>
      </div>
    </div>

    <div class="r-hero">
      <div class="r-hero-amt">${escape(formatBdt(reg.total_paid ?? reg.payment_amount))} <span>paid</span></div>
      <div class="r-hero-sub">Paid on ${escape(formatDate(reg.payment_date))} &middot; ${escape(programLabel)}</div>
    </div>

    <div class="r-card">
      <div class="r-card-h">Payment Details</div>
      <dl class="r-dl">
        <div class="r-line"><dt>Receipt number</dt><dd class="mono">${escape(receiptNo)}</dd></div>
        ${reg.payment_method ? `<div class="r-line"><dt>Payment method</dt><dd>${escape(reg.payment_method)}</dd></div>` : ''}
        ${reg.tran_id ? `<div class="r-line"><dt>Transaction ID</dt><dd class="mono">${escape(reg.tran_id)}</dd></div>` : ''}
        ${account.memberId ? `<div class="r-line"><dt>BdMSO ID</dt><dd class="mono">${escape(account.memberId)}</dd></div>` : ''}
        <div class="r-line"><dt>Billed to</dt><dd>${escape(account.email)}</dd></div>
      </dl>
    </div>

    <div class="r-card">
      <div class="r-card-h">Registration</div>
      <div class="r-item">
        <div>
          <div class="r-item-name">${escape(programLabel)}</div>
          ${reg.option_labels && reg.option_labels.length ? `<div style="margin-top:4px;font-size:12px;font-weight:600;color:var(--navy);">${escape(reg.option_labels.join(' · '))}</div>` : ''}
          <div class="r-item-sub">${escape([reg.student_full_name, reg.student_class_name, reg.student_school, reg.student_district].filter(Boolean).join(' · '))}</div>
        </div>
        <div class="r-item-amt">${escape(formatBdt(reg.total_paid ?? reg.payment_amount))}</div>
      </div>
      <div class="r-total">
        <span>Total paid</span>
        <span>${escape(formatBdt(reg.total_paid ?? reg.payment_amount))}</span>
      </div>
    </div>

    <div class="r-note">
      <p>This is an electronic receipt for your BdMSO enrollment. Please retain it for your records - you may be asked to show it on program day. For any questions or corrections, email <strong>support@bdmso.org</strong> and quote your BdMSO ID.</p>
      <p><strong>Refund policy:</strong> Any transaction made through the BdMSO website is non-refundable.</p>
    </div>

    <div class="r-foot">
      <div class="r-foot-org">
        <strong>Bangladesh Mathematics &amp; Science Olympiad</strong>
        Level 12, Building #758, Green City Center,<br>Sat Masjid Road, Dhanmondi, Dhaka 1209
      </div>
      <div class="r-foot-help"><strong>Need help?</strong><br>support@bdmso.org</div>
    </div>
  </div>

  <script>window.addEventListener('load', function () {
    var go = function () { setTimeout(function () { window.print(); }, 200); };
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(go); } else { go(); }
  });</script>
</body></html>`;

  // Build the receipt as a Blob and open it via a real anchor click.
  // A synchronous anchor navigation triggered by the user's tap is a
  // user-gesture navigation, so it isn't popup-blocked the way
  // window.open('', '_blank') + document.write is on mobile (iOS Safari
  // in particular). The receipt's inline script still auto-prints.
  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.target   = '_blank';
  a.rel      = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after a delay so the new tab has time to load the document.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

type PaymentNotice = 'success' | 'cancelled' | 'failed';

function readPaymentNotice(): PaymentNotice | null {
  const v = new URLSearchParams(location.search).get('payment');
  return v === 'success' || v === 'cancelled' || v === 'failed' ? v : null;
}

type StatFilter = 'all' | 'paid' | 'pending' | 'cancelled';

export function Home() {
  const [data, setData]     = useState<Response | null>(null);
  const [error, setError]   = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<PaymentNotice | null>(() => readPaymentNotice());
  // Transient in-app confirmation for card-level actions (cancel, coupon
  // removed) so they aren't silent after a reload.
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [statFilter, setStatFilter] = useState<StatFilter>('all');
  const [idFlipped, setIdFlipped]   = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);

  function reload() {
    setError(null);
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
      .catch((err: ApiError) => setError(err));
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

  // Post-enrollment focus: registration.html / add-enrollment redirect
  // here with ?focus=<registration_id> so the freshly-created card can
  // be scrolled into view + highlighted briefly. Runs only when data
  // has landed (the card needs to exist in the DOM) and one-shots
  // itself by stripping the param so a refresh doesn't re-trigger.
  useEffect(() => {
    if (!data) return;
    const params = new URLSearchParams(location.search);
    const focusId = params.get('focus');
    if (!focusId) return;
    // Two animation frames so the registration list has actually
    // mounted before we look up the node.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.querySelector(`[data-reg-id="${CSS.escape(focusId)}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('reg-card-focus');
        setTimeout(() => el.classList.remove('reg-card-focus'), 2400);
      }
    }));
    const url = new URL(location.href);
    url.searchParams.delete('focus');
    url.searchParams.delete('enrolled');
    history.replaceState(null, '', url.toString());
  }, [data]);

  if (error) return <ErrorPanel error={error} onRetry={reload} />;
  if (!data) return <DashboardSkeleton />;

  // Sort: submitted (payment due) → paid → cancelled, then most recent
  // first. The unpaid cards carry the next action (Pay Now), so they
  // land at the top of the grid where the parent's eye goes first -
  // right after enrolling, the freshly-created card is one tap away
  // from checkout instead of buried below paid history.
  const statusOrder = (s: Registration['status']) =>
    s === 'submitted' ? 0 : s === 'paid' ? 1 : 2;
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
  // Cancelled cards are collapsed by default into their own expandable
  // group, so they don't crowd out the active registrations.
  const activeShown    = shownRegs.filter((r) => r.status !== 'cancelled');
  const cancelledShown = shownRegs.filter((r) => r.status === 'cancelled');
  // The dashboard addresses the student (the candidate), not the
  // guardian. Falls back to the guardian's name only if no registration
  // exists yet to read a student name from.
  const firstName = (idStudent?.student_full_name || data.account.fullName).split(' ')[0];

  return (
    <>
      {notice === 'success' && (
        <div class="alert alert-ok">
          <strong>Payment confirmed.</strong> Your enrollment is paid - your BdMSO ID and a receipt should be in your inbox within a minute.
          <button type="button" class="alert-close" onClick={() => setNotice(null)} aria-label="Dismiss"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        </div>
      )}
      {notice === 'cancelled' && (
        <div class="alert">
          <strong>Payment cancelled.</strong> No charge was made. You can try again from the enrollment below.
          <button type="button" class="alert-close" onClick={() => setNotice(null)} aria-label="Dismiss"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        </div>
      )}
      {notice === 'failed' && (
        <div class="alert alert-bad">
          <strong>Payment didn't go through.</strong> If money was deducted, contact <a href="mailto:support@bdmso.org">support@bdmso.org</a> with your transaction reference - otherwise just try again.
          <button type="button" class="alert-close" onClick={() => setNotice(null)} aria-label="Dismiss"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        </div>
      )}
      {actionMsg && (
        <div class="alert alert-ok" role="status">
          {actionMsg}
          <button type="button" class="alert-close" onClick={() => setActionMsg(null)} aria-label="Dismiss"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        </div>
      )}

      {/* ── Hero: greeting + virtual student ID card ──────────────── */}
      <section class="dash-hero">
        <div class="dash-hero-text">
          <span class="dash-hero-pill">BdMSO Portal · 2026</span>
          <h1>Welcome back, {firstName}.</h1>
          <p>
            Everything tied to your account in one place - track enrollments,
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
                <span class="id-card-label">Registered Student</span>
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
        <Stat label="All Enrollments" value={String(regs.length)} icon="reg"
              active={statFilter === 'all'} onClick={() => setStatFilter('all')} />
        <Stat label="Payment Pending" value={String(pending)} tone={pending > 0 ? 'warn' : 'muted'} icon="pending"
              active={statFilter === 'pending'} onClick={() => setStatFilter('pending')} />
        <Stat label="Completed Enrollments" value={String(paid)} tone="ok" icon="paid"
              active={statFilter === 'paid'} onClick={() => setStatFilter('paid')} />
        <Stat label="Cancelled Enrollments" value={String(cancelled)} tone="muted" icon="cancelled"
              active={statFilter === 'cancelled'} onClick={() => setStatFilter('cancelled')} />
      </div>

      {/* ── Registrations (left) + sidebar (right) ────────────────── */}
      <div class="dash-grid">
        <div class="dash-grid-main">
          <div class="dash-section-head" id="your-enrollments">
            <h2 class="section-h2">Your Enrollments</h2>
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
              <p>No {statFilter} enrollments.</p>
              <button type="button" class="dash-clear-filter" onClick={() => setStatFilter('all')}>
                Show all enrollments
              </button>
            </div>
          ) : (
            <div class="reg-list">
              {(statFilter === 'cancelled' ? shownRegs : activeShown).map((r) => (
                <RegistrationCard key={r.id} reg={r} allRegs={regs} account={data.account} onChanged={reload} onNotice={setActionMsg} />
              ))}

              {statFilter !== 'cancelled' && cancelledShown.length > 0 && (
                <div class="reg-cancelled-group">
                  <button
                    type="button"
                    class="reg-cancelled-toggle"
                    aria-expanded={showCancelled}
                    onClick={() => setShowCancelled((v) => !v)}
                  >
                    <span>
                      {showCancelled ? 'Hide' : 'Show'} {cancelledShown.length} cancelled
                      {cancelledShown.length === 1 ? ' enrollment' : ' enrollments'}
                    </span>
                    <svg
                      class={`reg-cancelled-chevron${showCancelled ? ' open' : ''}`}
                      viewBox="0 0 24 24" width="15" height="15"
                      fill="none" stroke="currentColor" stroke-width="2.6"
                      stroke-linecap="round" stroke-linejoin="round"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  {showCancelled && cancelledShown.map((r) => (
                    <RegistrationCard key={r.id} reg={r} allRegs={regs} account={data.account} onChanged={reload} onNotice={setActionMsg} />
                  ))}
                </div>
              )}
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
          <ImportantDates regs={regs} />
        </aside>
      </div>

      <ExploreOtherPrograms />
    </>
  );
}

// Email-verification nag in the dashboard hero. The verification email
// can go missing (spam, typo'd address, blocked sender), so this offers
// a one-click resend wired to POST /api/resend-verification.
function VerifyEmailNotice({ email }: { email: string }) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  async function resend() {
    if (cooldown > 0) return;
    setStatus('sending');
    try {
      const res = await api.post<{ ok: true; alreadyVerified?: boolean }>('/api/resend-verification', {});
      setStatus('sent');
      setCooldown(30);
      setMsg(res.alreadyVerified
        ? 'Your email is already verified - refresh the page.'
        : `Verification email sent to ${email}. Check your inbox and spam folder.`);
    } catch (err) {
      setStatus('error');
      setMsg(err instanceof ApiError ? err.message : 'Could not send right now - try again shortly.');
    }
  }

  if (status === 'sent' && cooldown > 0) {
    return (
      <div class="dash-hero-verify is-sent">
        <span class="dot" /> {msg} <span class="muted">(resend in {cooldown}s)</span>
      </div>
    );
  }

  return (
    <div class="dash-hero-verify">
      <span class="dot" />
      <span>{status === 'sent' ? 'Didn\'t get it? You can resend now.' : 'Verify your email to receive receipts & admit cards.'}</span>
      <button
        type="button"
        class="dash-hero-verify-btn"
        onClick={resend}
        disabled={status === 'sending' || cooldown > 0}
      >
        {status === 'sending' ? 'Sending…' : status === 'sent' ? 'Resend again' : 'Resend email'}
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
    { done: paidCount > 0, label: 'First payment cleared', sub: pendingCount > 0 ? `${pendingCount} enrollment${pendingCount === 1 ? '' : 's'} awaiting payment` : 'All enrollments are paid' },
    { done: hasMemberId, label: 'BdMSO ID issued', sub: hasMemberId ? 'Use it across every program' : 'Issued on your first paid receipt' },
  ];
  // Once every item is done the card is just a row of green ticks. Hide
  // it so the right rail leaves room for cards that still matter.
  if (items.every((it) => it.done)) return null;
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

// "Key dates" - derived from the guardian's own registrations so the
// list reflects what's actually on their plate, not the generic IMSO
// timeline. Each registration can contribute up to three items:
//   - Program starts on (catalog: startsOn)
//   - Register/pay by (catalog: registrationEnds, only when unpaid)
//   - Change selection by (catalog: optionsEditableUntil, only when the
//     program has editable options and the window is still open)
// Repeatable programs (Mock Test) hit the same catalog dates on every
// row they own, so we dedupe by message + date and a guardian with two
// Mock Test bookings sees one "Mock Test starts" line, not two.
// Past dates are filtered out. Hidden entirely when nothing's upcoming.
// Each item is split into before/program/after segments so the program
// name renders in its own styled span (.datelist-prog) - it's the part
// guardians scan for, and the surrounding scaffolding shouldn't compete.
type DateItem = { iso: string; before: string; program: string; after: string };

function buildKeyDates(regs: Registration[], todayISO: string): DateItem[] {
  const seen = new Set<string>();
  const items: DateItem[] = [];
  const push = (iso: string, before: string, program: string, after: string) => {
    const key = `${iso}|${before}|${program}|${after}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ iso, before, program, after });
  };
  for (const r of regs) {
    if (r.status === 'cancelled') continue;
    if (r.starts_on && r.starts_on >= todayISO) {
      push(r.starts_on, '', r.program_label, ' starts');
    }
    // Pay-by line for unpaid enrollments; carries the same date as the
    // edit deadline below, but the verb / urgency is different.
    if (r.payment_status !== 'paid' && r.registration_ends && r.registration_ends >= todayISO) {
      push(r.registration_ends, 'Pay for ', r.program_label, ' by this date');
    }
    // Edit deadline for paid enrollments only - one window per program
    // (registrationEnds). Unpaid rows already get a Pay-by entry on the
    // same date, so showing both would just duplicate the row.
    if (r.payment_status === 'paid' && r.edit_window_open
        && r.registration_ends && r.registration_ends >= todayISO) {
      push(r.registration_ends, 'Last day to edit ', r.program_label, '');
    }
  }
  items.sort((a, b) => a.iso.localeCompare(b.iso));
  return items.slice(0, 6);
}

function ImportantDates({ regs }: { regs: Registration[] }) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
  const items = buildKeyDates(regs, today);
  if (items.length === 0) return null;
  return (
    <section class="side-card">
      <h3 class="side-card-title">Key dates</h3>
      <ul class="datelist">
        {items.map((it, i) => (
          <li key={`${it.iso}-${i}`} class="datelist-item">
            <span class="datelist-date">{formatDate(it.iso)}</span>
            <span class="datelist-name">
              {it.before}<span class="datelist-prog">{it.program}</span>{it.after}
            </span>
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
  metaDescription?: string;
  audience?: string;
  home_order?: string;
  registration?: boolean;
  hidden?: boolean;
};

function ExploreOtherPrograms() {
  const [programs, setPrograms] = useState<ProgramDetail[] | null>(null);

  useEffect(() => {
    api.get<ProgramDetail[]>('/api/catalog')
      .then(setPrograms)
      .catch(() => setPrograms([]));
  }, []);

  if (!programs) return null;

  // A program is "open for registration" when registration isn't
  // explicitly closed and it isn't hidden - both controlled from
  // programs-detail.json. We don't filter by "already registered"
  // because a parent may want to enroll another child or re-enroll
  // after a cancel; the per-program page handles that UX.
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
            {(p.tagline || p.metaDescription) && <p class="explore-card-desc">{p.tagline || p.metaDescription}</p>}
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
          Nothing's open for enrollment right now. Browse the full catalog for what's coming next.
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

function RegistrationCard({ reg, allRegs, account, onChanged, onNotice }: { reg: Registration; allRegs: Registration[]; account: AccountInfo; onChanged: () => void; onNotice: (msg: string) => void }) {
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
  const [payMethod, setPayMethod]       = useState<'online' | 'manual'>('online');
  const [showEdit, setShowEdit] = useState(false);

  // Olympiad / Quiz have per-program meta (preferred_subject for
  // Olympiad, preferred_venue for both) editable via the same modal
  // as options. The values aren't shown inline on the card any more;
  // they live behind the Edit button so the card stays compact.
  const isOlympiad = reg.registration_type === 'national-olympiad';
  const isQuiz     = reg.registration_type === 'national-quiz-competition';
  const canEditDetails = (isOlympiad || isQuiz) && reg.edit_window_open && reg.status !== 'cancelled';

  // Change-selection is offered only for programs with options whose
  // edit window is still open AND a non-cancelled registration. On a
  // pending payment we hide it - the guardian must finish or cancel
  // their checkout first (server enforces this too).
  const canChangeOptions =
    !!reg.options_config && reg.edit_window_open
    && reg.status !== 'cancelled' && reg.payment_status !== 'pending';
  const currentOptionIds: string[] = (() => {
    if (!reg.program_options) return [];
    try {
      const v = JSON.parse(reg.program_options);
      return Array.isArray(v) ? v : [];
    } catch { return []; }
  })();
  // Option ids held by OTHER non-cancelled registrations on this
  // account for the same program. Used by the modal to disable items
  // the guardian already booked elsewhere, preventing duplicate
  // bookings (e.g., picking "Mock Test 1 - Math" on two separate
  // Mock Test rows).
  const siblingOptionIds: string[] = (() => {
    const ids: string[] = [];
    for (const r of allRegs) {
      if (r.id === reg.id) continue;
      if (r.status === 'cancelled') continue;
      if (r.registration_type !== reg.registration_type) continue;
      if (!r.program_options) continue;
      try {
        const v = JSON.parse(r.program_options);
        if (Array.isArray(v)) for (const x of v) if (typeof x === 'string') ids.push(x);
      } catch {}
    }
    return ids;
  })();

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
      const data = await api.get<{ discountType: string; discountValue: number; description: string }>(url);

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
      const body = { registrationId: reg.id, couponCode: coupon?.code || '', paymentMethod: payMethod };
      const data = await api.post<{ ok: true; free?: boolean; checkoutURL?: string; manual?: boolean; invoiceUrl?: string }>('/api/create-payment', body);
      if (data.free) {
        location.href = '/dashboard?payment=success';
        return;
      }
      if (data.manual && data.invoiceUrl) {
        location.href = data.invoiceUrl;
        return;
      }
      if (data.checkoutURL) {
        location.href = data.checkoutURL;
        return;
      }
      location.href = '/dashboard?payment=success';
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
      onNotice(`Enrollment cancelled for ${reg.student_full_name}. Re-register from the programs page to re-enroll.`);
      loadMe(true);
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
    : reg.payment_status === 'pending' ? 'pending resume'
    : 'pending';

  return (
    <article class="reg-card" data-reg-id={reg.id}>
      {/* Left: program title, student, fact strip */}
      <div class="reg-card-main">
        <div class="reg-card-head">
          <h3 class="reg-card-program">
            {reg.program_label}
          </h3>
          <span class={`badge badge-${reg.status === 'paid' ? 'ok' : reg.status === 'cancelled' ? 'muted' : 'warn'}`}>
            {reg.status}
          </span>
          {/* Single Edit affordance for everything a guardian can change
              on this row: option selection (Prep / Mock / Olympiad
              price tier) AND per-program meta (Olympiad subject,
              Olympiad+Quiz venue). The unified modal renders only the
              applicable sections. Sitting in the header keeps the
              card consistent: programs without an options row (Quiz)
              get the same affordance in the same spot as programs
              with one (Olympiad). */}
          {(canChangeOptions || canEditDetails) && (
            <button
              type="button"
              class="reg-card-change-btn"
              onClick={() => setShowEdit(true)}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" />
              </svg>
              Edit
            </button>
          )}
        </div>
        {/* Options row (informational only - button moved up to the
            header). Skipped entirely when the program has no options
            block; subject + venue are NOT shown inline since they're
            accessible from the Edit modal and were redundant on the
            card. */}
        {(canChangeOptions || (reg.option_labels && reg.option_labels.length > 0)) && (
          <div class="reg-card-options-row">
            <div class="reg-card-options">{reg.option_labels?.length ? reg.option_labels.join(' · ') : 'No selection yet'}</div>
          </div>
        )}
        {/* Pending checkout suppresses the options editor (server enforces
            this too). Tell the parent why instead of silently hiding it. */}
        {!!reg.options_config && reg.edit_window_open
          && reg.status !== 'cancelled' && reg.payment_status === 'pending' && (
          <div class="reg-card-options-row">
            <div class="reg-card-options reg-card-options-hint">Finish or restart this payment to change your selection.</div>
          </div>
        )}
        <div class="reg-card-student">
          {reg.student_full_name} · {reg.student_class_name}
          {reg.student_gender ? ` · ${reg.student_gender}` : ''}
        </div>

        {reg.payment_status === 'paid' && (reg.payment_date || reg.tran_id) && (
          <div class="reg-card-facts">
            {reg.payment_date && (
              <div class="reg-fact"><span class="k">Paid on</span><span class="v">{formatDate(reg.payment_date)}</span></div>
            )}
            {reg.tran_id && (
              <div class="reg-fact"><span class="k">Txn ID</span><span class="v mono">{reg.tran_id.slice(-12).toUpperCase()}</span></div>
            )}
          </div>
        )}
        {reg.payment_status === 'pending' && (
          <div class="reg-card-note reg-card-note-pending">
            You started a payment but it wasn't completed — no charge was made. Pick up where you left off.
          </div>
        )}


      </div>

      {/* Middle: payment details - status, amount, coupon, cancel */}
      <div class={`reg-card-side ${sideClass}`}>
        {reg.payment_status === 'paid' ? (
          <>
            <span class="reg-card-side-label">Paid</span>
            <div class="reg-card-side-amount">{formatBdt(reg.total_paid ?? reg.payment_amount)}</div>
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
                {cancelling ? 'Cancelling…' : 'Cancel enrollment'}
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
            <div class="reg-card-foot">
              {coupon ? (
                <button
                  type="button"
                  class="reg-card-foot-link"
                  disabled={paying}
                  onClick={() => {
                    setCoupon(null);
                    setCouponInput('');
                    setCouponMsg(null);
                    setShowCoupon(false);
                    onNotice('Coupon removed.');
                  }}
                >
                  Remove coupon
                </button>
              ) : showCoupon ? (
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
                  {cancelling ? 'Cancelling…' : 'Cancel enrollment'}
                </button>
              )}
              {cancelError && <span class="reg-card-coupon-msg bad">{cancelError}</span>}
            </div>
          </>
        )}
      </div>

      {showEdit && (
        <ChangeSelectionModal
          registrationId={reg.id}
          programLabel={reg.program_label}
          paid={reg.status === 'paid'}
          config={canChangeOptions ? reg.options_config : null}
          currentIds={currentOptionIds}
          unavailableIds={siblingOptionIds}
          showSubject={canEditDetails && isOlympiad}
          showVenue={canEditDetails && (isOlympiad || isQuiz)}
          currentSubject={reg.preferred_subject}
          currentVenue={reg.preferred_venue}
          onClose={() => setShowEdit(false)}
          onChanged={onChanged}
        />
      )}

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
              Receipt
            </button>
          ) : onEnquiry ? (
            <a
              class="reg-card-receipt-btn reg-card-contact-btn"
              href={`mailto:support@bdmso.org?subject=${encodeURIComponent(`Fee enquiry - ${reg.program_label}`)}`}
            >
              Contact us
            </a>
          ) : (
            <>
              {!coupon?.free && (
                <div class="reg-card-pay-method">
                  <label class={`reg-card-pay-method-opt${payMethod === 'online' ? ' selected' : ''}`}>
                    <input
                      type="radio"
                      name={`pay-method-${reg.id}`}
                      value="online"
                      checked={payMethod === 'online'}
                      onChange={() => setPayMethod('online')}
                      disabled={paying}
                    />
                    Online
                  </label>
                  <label class={`reg-card-pay-method-opt${payMethod === 'manual' ? ' selected' : ''}`}>
                    <input
                      type="radio"
                      name={`pay-method-${reg.id}`}
                      value="manual"
                      checked={payMethod === 'manual'}
                      onChange={() => setPayMethod('manual')}
                      disabled={paying}
                    />
                    Cash
                  </label>
                </div>
              )}
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
