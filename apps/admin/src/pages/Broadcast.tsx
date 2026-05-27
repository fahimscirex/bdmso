// Broadcast - three tabs:
//   Send      - draft + filter + send. Optional load-from-template, optional
//               save-current-as-template. Live recipient count.
//   Templates - CRUD on saved subject/body pairs.
//   History   - past sends with sent/failed counts.

import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../api';
import { SkRoot, SkCard, SkTable } from '../components/Skeleton';
import { Icon } from '../components/Icon';

type Options = {
  byVenue: { venue: string }[];
  byProgram: { type: string; label: string }[];
};

type Template = {
  id: number;
  name: string;
  subject: string;
  body: string;
  category: string | null;
  updated_at: string;
};

type LogRow = {
  id: number;
  subject: string;
  body: string;
  filters_json: string | null;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  channel: 'email' | 'sms';
  sent_at: string;
  sent_by_email: string | null;
};

export function Broadcast() {
  const [tab, setTab] = useState<'send' | 'templates' | 'history'>('send');

  return (
    <>
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
        <div>
          <h1>Broadcast</h1>
          <p class="sub">Email guardians filtered by program, venue, or payment status. Save templates and review past sends.</p>
        </div>
        <div style="display:flex;gap:6px;">
          <TabBtn label="Send"     icon="send"     active={tab === 'send'}      onClick={() => setTab('send')} />
          <TabBtn label="Templates" icon="file-text" active={tab === 'templates'} onClick={() => setTab('templates')} />
          <TabBtn label="History"  icon="history"  active={tab === 'history'}   onClick={() => setTab('history')} />
        </div>
      </div>

      {tab === 'send'      && <SendTab />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'history'   && <HistoryTab />}
    </>
  );
}

function TabBtn({ label, icon, active, onClick }: { label: string; icon: any; active: boolean; onClick: () => void }) {
  return (
    <button type="button" class={`btn-secondary${active ? ' btn-primary' : ''}`} onClick={onClick}>
      <Icon name={icon} size={13} /> {label}
    </button>
  );
}

function SendTab() {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [program, setProgram] = useState('');
  const [venue,   setVenue]   = useState('');
  const [status,  setStatus]  = useState('');
  const [opts,  setOpts]  = useState<Options | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done,  setDone]  = useState<string | null>(null);

  useEffect(() => {
    api.get<Options>('/api/admin/analytics').then(setOpts).catch((err: ApiError) => setError(err.message));
    api.get<{ rows: Template[] }>('/api/admin/templates').then((d) => setTemplates(d.rows)).catch(() => {});
  }, []);

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

  function loadTemplate(id: number) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setSubject(t.subject);
    setMessage(t.body);
  }

  async function saveAsTemplate() {
    const name = prompt('Name for this template (e.g. "Payment reminder", "Exam day info"):', '');
    if (!name) return;
    try {
      const r = await api.post<{ id: number }>('/api/admin/templates', { name: name.trim(), subject, body: message });
      const fresh = await api.get<{ rows: Template[] }>('/api/admin/templates');
      setTemplates(fresh.rows);
      alert(`Saved template "${name}" (id ${r.id}).`);
    } catch (err) {
      alert((err as Error).message);
    }
  }

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
      setSubject(''); setMessage('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the broadcast.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && !busy && <div class="error">{error}</div>}

      <section class="card" style="max-width:760px;">
        <div class="form-grid" style="grid-template-columns:1fr;border:none;padding:0;gap:14px;">
          {templates.length > 0 && (
            <div class="field">
              <label>Load template</label>
              <select onChange={(e) => loadTemplate(Number((e.target as HTMLSelectElement).value))} value="">
                <option value="">— start from scratch —</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.category ? ` (${t.category})` : ''}</option>)}
              </select>
            </div>
          )}
          <div class="field">
            <label>Subject</label>
            <input type="text" value={subject} placeholder="e.g. Your BdMSO exam venue and date"
                   onInput={(e) => setSubject((e.target as HTMLInputElement).value)} />
          </div>
          <div class="field">
            <label>Message</label>
            <textarea rows={10} value={message} placeholder="Plain text. Line breaks are kept."
                      onInput={(e) => setMessage((e.target as HTMLTextAreaElement).value)} />
          </div>
          <div class="field">
            <label>Program</label>
            <select value={program} onChange={(e) => setProgram((e.target as HTMLSelectElement).value)}>
              <option value="">All programs</option>
              {opts?.byProgram.map((p) => <option key={p.type} value={p.type}>{p.label}</option>)}
            </select>
          </div>
          <div class="field">
            <label>Exam venue</label>
            <select value={venue} onChange={(e) => setVenue((e.target as HTMLSelectElement).value)}>
              <option value="">All venues</option>
              {opts?.byVenue.filter((v) => v.venue !== 'Not set').map((v) => <option key={v.venue} value={v.venue}>{v.venue}</option>)}
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
        {done && <p style="color:var(--green);margin:12px 0 0;font-size:13px;">{done}</p>}

        <div class="action-row" style="margin-top:16px;">
          <button type="button" class="btn-secondary" disabled={!subject.trim() || !message.trim()} onClick={saveAsTemplate}>
            <Icon name="file-text" size={13} /> Save as template
          </button>
          <button type="button" class="btn-primary" disabled={busy || !count} onClick={send}>
            {busy ? 'Sending…' : 'Send broadcast'}
          </button>
        </div>
      </section>
    </>
  );
}

function TemplatesTab() {
  const [rows, setRows] = useState<Template[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<Template> | null>(null);

  function load() {
    setRows(null);
    api.get<{ rows: Template[] }>('/api/admin/templates').then((d) => setRows(d.rows)).catch((err: ApiError) => setError(err.message));
  }
  useEffect(load, []);

  async function save() {
    if (!editing) return;
    if (!editing.name?.trim() || !editing.subject?.trim() || !editing.body?.trim()) {
      alert('Name, subject, body all required.'); return;
    }
    try {
      if (editing.id) {
        await api.patch(`/api/admin/templates/${editing.id}`, editing);
      } else {
        await api.post('/api/admin/templates', editing);
      }
      setEditing(null); load();
    } catch (err) { alert((err as Error).message); }
  }
  async function remove(id: number) {
    if (!confirm('Delete this template? Past sends are unaffected.')) return;
    try { await api.delete(`/api/admin/templates/${id}`); load(); }
    catch (err) { alert((err as Error).message); }
  }

  return (
    <>
      {error && <div class="error">{error}</div>}

      <div style="display:flex;justify-content:flex-end;margin-bottom:10px;">
        <button type="button" class="btn-primary" onClick={() => setEditing({ name: '', subject: '', body: '', category: '' })}>
          <Icon name="plus" size={14} /> New template
        </button>
      </div>

      {editing && (
        <section class="card" style="max-width:760px;border:2px solid var(--navy-700);">
          <h2 style="margin-top:0;">{editing.id ? `Edit "${editing.name}"` : 'New template'}</h2>
          <div class="form-grid" style="grid-template-columns:1fr 1fr;border:none;padding:0;">
            <div class="field"><label>Name</label>
              <input type="text" value={editing.name} onInput={(e) => setEditing({ ...editing, name: (e.target as HTMLInputElement).value })} /></div>
            <div class="field"><label>Category (optional)</label>
              <input type="text" value={editing.category || ''} onInput={(e) => setEditing({ ...editing, category: (e.target as HTMLInputElement).value })} placeholder="reminder, event, announcement" /></div>
            <div class="field field-full"><label>Subject</label>
              <input type="text" value={editing.subject} onInput={(e) => setEditing({ ...editing, subject: (e.target as HTMLInputElement).value })} /></div>
            <div class="field field-full"><label>Body</label>
              <textarea rows={10} value={editing.body} onInput={(e) => setEditing({ ...editing, body: (e.target as HTMLTextAreaElement).value })} /></div>
          </div>
          <div class="action-row" style="margin-top:12px;">
            <button type="button" class="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button type="button" class="btn-primary" onClick={save}>Save</button>
          </div>
        </section>
      )}

      {!rows && !error && <SkRoot><SkTable headers={['Name', 'Subject', 'Category', 'Updated', '']} rows={4} /></SkRoot>}
      {rows && rows.length === 0 && <div class="empty"><p>No templates yet.</p></div>}
      {rows && rows.length > 0 && (
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Subject</th>
                <th>Category</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td class="cell-strong">{t.name}</td>
                  <td>{t.subject}</td>
                  <td>{t.category || <span class="muted">-</span>}</td>
                  <td class="cell-sub">{new Date(t.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
                  <td style="white-space:nowrap;">
                    <button type="button" class="btn-secondary" onClick={() => setEditing(t)} style="padding:4px 9px;font-size:12px;margin-right:4px;">Edit</button>
                    <button type="button" class="btn-danger" onClick={() => remove(t.id)} style="padding:4px 9px;font-size:12px;">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function HistoryTab() {
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ rows: LogRow[] }>('/api/admin/broadcast/log').then((d) => setRows(d.rows)).catch((err: ApiError) => setError(err.message));
  }, []);

  if (error) return <div class="error">{error}</div>;
  if (!rows) return <SkRoot><SkCard lines={5} /></SkRoot>;
  if (rows.length === 0) return <div class="empty"><p>No broadcasts sent yet.</p></div>;

  return (
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Sent</th>
            <th>Channel</th>
            <th>Subject</th>
            <th>Recipients</th>
            <th>Sent / Failed</th>
            <th>Sent by</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td class="cell-sub">{new Date(r.sent_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
              <td><span class="badge badge-plain">{r.channel}</span></td>
              <td>
                <div class="cell-strong">{r.subject}</div>
                <div class="cell-sub">{(r.body || '').slice(0, 90)}{r.body.length > 90 ? '…' : ''}</div>
              </td>
              <td>{r.recipient_count}</td>
              <td>
                <span style="color:var(--green);font-weight:600;">{r.sent_count}</span>
                <span class="muted"> / </span>
                <span style={r.failed_count > 0 ? 'color:var(--red);font-weight:600;' : 'color:var(--ink-3);'}>{r.failed_count}</span>
              </td>
              <td class="cell-sub">{r.sent_by_email || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
