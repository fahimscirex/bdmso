// Broadcast - email an announcement to registered guardians, filtered by
// program / exam venue / registration status. Sends via Brevo. Shows a live
// recipient count and confirms before sending since it can't be undone.

import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../api';

type Options = {
  byVenue: { venue: string }[];
  byProgram: { type: string; label: string }[];
};

export function Broadcast() {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [program, setProgram] = useState('');
  const [venue,   setVenue]   = useState('');
  const [status,  setStatus]  = useState('');

  const [opts,  setOpts]  = useState<Options | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done,  setDone]  = useState<string | null>(null);

  // Program + venue filter options come straight from real registration data.
  useEffect(() => {
    api.get<Options>('/api/admin/analytics')
      .then(setOpts)
      .catch((err: ApiError) => setError(err.message));
  }, []);

  // Live recipient count for the current filters (debounced).
  useEffect(() => {
    setCount(null);
    const t = setTimeout(() => {
      const qs: string[] = [];
      if (program) qs.push(`program=${encodeURIComponent(program)}`);
      if (venue)   qs.push(`venue=${encodeURIComponent(venue)}`);
      if (status)  qs.push(`status=${encodeURIComponent(status)}`);
      api.get<{ count: number }>(`/api/admin/broadcast/recipients${qs.length ? `?${qs.join('&')}` : ''}`)
        .then((r) => setCount(r.count))
        .catch(() => setCount(null));
    }, 250);
    return () => clearTimeout(t);
  }, [program, venue, status]);

  async function send() {
    setError(null);
    setDone(null);
    if (!subject.trim()) { setError('Subject is required.'); return; }
    if (!message.trim()) { setError('Message is required.'); return; }
    if (!confirm(`Send this email to ${count ?? 'the matching'} guardian(s)? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await api.post<{ ok: true; recipients: number; sent: number; failed: number }>(
        '/api/admin/broadcast',
        { subject: subject.trim(), message: message.trim(), program, venue, status },
      );
      setDone(`Sent to ${res.sent} of ${res.recipients} guardian(s).${res.failed ? ` ${res.failed} failed - check logs.` : ''}`);
      setSubject('');
      setMessage('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the broadcast.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div class="page-header">
        <h1>Broadcast</h1>
        <p class="sub">Email an announcement to registered guardians. Recorded in the audit log.</p>
      </div>

      {error && !busy && <div class="error">{error}</div>}

      <section class="card" style="max-width:660px;">
        <div class="form-grid" style="grid-template-columns:1fr;border:none;padding:0;gap:14px;">
          <div class="field">
            <label>Subject</label>
            <input
              type="text" value={subject}
              placeholder="e.g. Your BdMSO exam venue and date"
              onInput={(e) => setSubject((e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="field">
            <label>Message</label>
            <textarea
              rows={8} value={message}
              placeholder="Plain text. Line breaks are kept."
              onInput={(e) => setMessage((e.target as HTMLTextAreaElement).value)}
            />
          </div>
          <div class="field">
            <label>Program</label>
            <select value={program} onChange={(e) => setProgram((e.target as HTMLSelectElement).value)}>
              <option value="">All programs</option>
              {opts?.byProgram.map((p) => <option value={p.type}>{p.label}</option>)}
            </select>
          </div>
          <div class="field">
            <label>Exam venue</label>
            <select value={venue} onChange={(e) => setVenue((e.target as HTMLSelectElement).value)}>
              <option value="">All venues</option>
              {opts?.byVenue.filter((v) => v.venue !== 'Not set').map((v) => <option value={v.venue}>{v.venue}</option>)}
            </select>
          </div>
          <div class="field">
            <label>Audience</label>
            <select value={status} onChange={(e) => setStatus((e.target as HTMLSelectElement).value)}>
              <option value="">Everyone registered</option>
              <option value="paid">Paid only</option>
              <option value="submitted">Awaiting payment</option>
            </select>
          </div>
        </div>

        <p class="muted" style="margin:16px 0 0;">
          {count == null
            ? 'Counting recipients…'
            : <>This reaches <strong>{count}</strong> guardian{count === 1 ? '' : 's'}.</>}
        </p>

        {done && <p style="color:var(--green,#15803d);margin:12px 0 0;font-size:13px;">{done}</p>}

        <div class="action-row" style="margin-top:16px;">
          <button type="button" class="btn-primary" disabled={busy || !count} onClick={send}>
            {busy ? 'Sending…' : 'Send broadcast'}
          </button>
        </div>
      </section>
    </>
  );
}
