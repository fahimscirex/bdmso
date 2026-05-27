// Event-day operations: roster, check-in, score entry. One page handles
// all three because organisers tend to switch between them on the day.
//
// Pick an event from the dropdown (or type a new event_key like
// 'national-round-2026'), narrow to a venue/class, then:
//   - tick rows present/absent inline (check-in)
//   - type a score per section inline (scores)
//   - print the roster (browser Print → PDF works for now; real PDF
//     templates come when certificate generation lands).

import { useEffect, useMemo, useState } from 'preact/hooks';
import { api, ApiError } from '../api';
import { SkRoot, SkTable } from '../components/Skeleton';
import { Icon } from '../components/Icon';
import { toCsv, downloadCsv } from '../csv';

type EventRow = { event_key: string; rows: number };

type RosterRow = {
  id: string;
  student_full_name: string;
  student_class_name: string;
  student_gender: string;
  student_school: string;
  student_district: string;
  preferred_venue: string | null;
  registration_type: string;
  program_label: string;
  member_id: string | null;
  attendance_status: 'present' | 'absent' | 'late' | 'no_show';
  checked_in_at: string | null;
};

type ScoreRow = {
  id: number;
  registration_id: string;
  section: string;
  score: number;
  max_score: number;
  rank: number | null;
  tier: string | null;
  student_full_name: string;
  student_class_name: string;
  preferred_venue: string | null;
};

const DEFAULT_EVENT = 'national-round-2026';
const DEFAULT_MAX_SCORE = 100;

export function Events() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventKey, setEventKey] = useState(DEFAULT_EVENT);
  const [eventDraft, setEventDraft] = useState(DEFAULT_EVENT);
  const [venue, setVenue] = useState('');
  const [klass, setKlass] = useState('');
  const [section, setSection] = useState('math');
  const [tab, setTab] = useState<'roster' | 'scores'>('roster');
  const [roster, setRoster] = useState<RosterRow[] | null>(null);
  const [scores, setScores] = useState<ScoreRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load known events on first render.
  useEffect(() => {
    api.get<{ rows: EventRow[] }>('/api/admin/events').then((d) => setEvents(d.rows)).catch(() => {});
  }, []);

  function loadRoster() {
    setError(null);
    setRoster(null);
    const qs: string[] = [];
    if (venue) qs.push(`venue=${encodeURIComponent(venue)}`);
    if (klass) qs.push(`class=${encodeURIComponent(klass)}`);
    const url = `/api/admin/events/${encodeURIComponent(eventKey)}/roster${qs.length ? `?${qs.join('&')}` : ''}`;
    api.get<{ rows: RosterRow[] }>(url)
      .then((d) => setRoster(d.rows))
      .catch((err: ApiError) => setError(err.message));
  }

  function loadScores() {
    setError(null);
    setScores(null);
    const url = `/api/admin/events/${encodeURIComponent(eventKey)}/scores?section=${encodeURIComponent(section)}`;
    api.get<{ rows: ScoreRow[] }>(url)
      .then((d) => setScores(d.rows))
      .catch((err: ApiError) => setError(err.message));
  }

  useEffect(() => { if (tab === 'roster') loadRoster(); else loadScores(); }, [tab, eventKey, venue, klass, section]);

  async function checkIn(regId: string, status: RosterRow['attendance_status']) {
    try {
      await api.post(`/api/admin/events/${encodeURIComponent(eventKey)}/checkin`, { registration_id: regId, status });
      // Optimistically update.
      setRoster((rows) => rows?.map((r) => r.id === regId ? { ...r, attendance_status: status, checked_in_at: new Date().toISOString() } : r) || rows);
    } catch (err) {
      alert((err as Error).message);
      loadRoster();
    }
  }

  async function saveScore(regId: string, scoreVal: number, maxScore: number) {
    try {
      await api.post(`/api/admin/events/${encodeURIComponent(eventKey)}/scores`, {
        registration_id: regId, section, score: scoreVal, max_score: maxScore,
      });
      loadScores();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function finalize() {
    const tierTop = Number(prompt('How many top scorers in this section qualify as winners? Enter 0 to skip tier tagging:', '10') || '0');
    if (!Number.isFinite(tierTop)) return;
    try {
      const r = await api.post<{ ranked: number; tier_top: number }>(
        `/api/admin/events/${encodeURIComponent(eventKey)}/scores/finalize`,
        { section, tier_top: tierTop },
      );
      alert(`Ranked ${r.ranked} scores. Top ${r.tier_top} tagged as winners.`);
      loadScores();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  function exportRoster() {
    if (!roster) return;
    downloadCsv(
      `bdmso-roster-${eventKey}-${new Date().toISOString().slice(0,10)}.csv`,
      toCsv(
        ['Member ID', 'Student', 'Class', 'Gender', 'School', 'District', 'Venue', 'Program', 'Attendance'],
        roster.map((r) => [r.member_id || '', r.student_full_name, r.student_class_name, r.student_gender, r.student_school, r.student_district, r.preferred_venue || '', r.program_label, r.attendance_status]),
      ),
    );
  }
  function exportScores() {
    if (!scores) return;
    downloadCsv(
      `bdmso-scores-${eventKey}-${section}-${new Date().toISOString().slice(0,10)}.csv`,
      toCsv(
        ['Student', 'Class', 'Venue', 'Section', 'Score', 'Max', 'Rank', 'Tier'],
        scores.map((s) => [s.student_full_name, s.student_class_name, s.preferred_venue || '', s.section, s.score, s.max_score, s.rank ?? '', s.tier ?? '']),
      ),
    );
  }

  const venues = useMemo(() => {
    if (!roster) return [];
    return Array.from(new Set(roster.map((r) => r.preferred_venue || '').filter(Boolean))).sort();
  }, [roster]);
  const classes = useMemo(() => {
    if (!roster) return [];
    return Array.from(new Set(roster.map((r) => r.student_class_name).filter(Boolean))).sort();
  }, [roster]);

  return (
    <>
      <div class="page-header">
        <h1>Event day</h1>
        <p class="sub">Roster, check-in, score entry. Pick an event then narrow to your venue or class.</p>
      </div>

      <div class="card" style="padding:14px 18px;">
        <div style="display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;">
          <label class="field" style="flex:0 0 280px;">
            <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--ink-3);">Event key</span>
            <input
              type="text"
              value={eventDraft}
              onInput={(e) => setEventDraft((e.target as HTMLInputElement).value)}
              onBlur={() => setEventKey(eventDraft.trim() || DEFAULT_EVENT)}
              onKeyDown={(e) => { if (e.key === 'Enter') setEventKey(eventDraft.trim() || DEFAULT_EVENT); }}
              placeholder="e.g. national-round-2026"
            />
          </label>
          {events.length > 0 && (
            <label class="field" style="flex:0 0 220px;">
              <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--ink-3);">Recent events</span>
              <select
                value=""
                onChange={(e) => {
                  const v = (e.target as HTMLSelectElement).value;
                  if (v) { setEventDraft(v); setEventKey(v); }
                }}
              >
                <option value="">— pick one —</option>
                {events.map((ev) => <option key={ev.event_key} value={ev.event_key}>{ev.event_key} ({ev.rows})</option>)}
              </select>
            </label>
          )}
          <div style="display:flex;gap:6px;margin-left:auto;">
            <button type="button" class={`btn-secondary${tab === 'roster' ? ' btn-primary' : ''}`} onClick={() => setTab('roster')}>
              <Icon name="list-checks" size={14} /> Roster + check-in
            </button>
            <button type="button" class={`btn-secondary${tab === 'scores' ? ' btn-primary' : ''}`} onClick={() => setTab('scores')}>
              <Icon name="edit" size={14} /> Score entry
            </button>
          </div>
        </div>
      </div>

      <div class="chip-row" style="margin-top:14px;">
        {venues.length > 0 && (
          <label class={`chip${venue ? ' chip-active' : ''}`}>
            <span class="chip-label">Venue</span>
            <select value={venue} onChange={(e) => setVenue((e.target as HTMLSelectElement).value)}>
              <option value="">All</option>
              {venues.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
        )}
        {classes.length > 0 && (
          <label class={`chip${klass ? ' chip-active' : ''}`}>
            <span class="chip-label">Class</span>
            <select value={klass} onChange={(e) => setKlass((e.target as HTMLSelectElement).value)}>
              <option value="">All</option>
              {classes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        )}
        {tab === 'scores' && (
          <label class={`chip${section ? ' chip-active' : ''}`}>
            <span class="chip-label">Section</span>
            <select value={section} onChange={(e) => setSection((e.target as HTMLSelectElement).value)}>
              <option value="math">Math</option>
              <option value="science">Science</option>
              <option value="tst-math">TST Math</option>
              <option value="tst-science">TST Science</option>
            </select>
          </label>
        )}
      </div>

      {error && <div class="error">{error}</div>}

      {tab === 'roster' && (
        <RosterTab
          roster={roster}
          onCheckIn={checkIn}
          onExport={exportRoster}
          onPrint={() => window.print()}
        />
      )}
      {tab === 'scores' && (
        <ScoresTab
          scores={scores}
          section={section}
          onSave={saveScore}
          onFinalize={finalize}
          onExport={exportScores}
        />
      )}
    </>
  );
}

function RosterTab({ roster, onCheckIn, onExport, onPrint }: {
  roster: RosterRow[] | null;
  onCheckIn: (id: string, status: RosterRow['attendance_status']) => void;
  onExport: () => void;
  onPrint: () => void;
}) {
  if (!roster) return <SkRoot><SkTable headers={['Member ID', 'Student', 'Class', 'School', 'Venue', 'Attendance']} rows={6} /></SkRoot>;
  if (roster.length === 0) {
    return <div class="empty"><p>No paid registrations match these filters.</p></div>;
  }
  const presentCount = roster.filter((r) => r.attendance_status === 'present').length;
  return (
    <>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:10px;flex-wrap:wrap;">
        <div class="muted">{presentCount} of {roster.length} checked in</div>
        <div style="display:flex;gap:6px;">
          <button type="button" class="btn-secondary" onClick={onExport}><Icon name="download" size={13} /> Export CSV</button>
          <button type="button" class="btn-secondary" onClick={onPrint}><Icon name="file-text" size={13} /> Print</button>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Member ID</th>
              <th>Student</th>
              <th>Class</th>
              <th>School</th>
              <th>Venue</th>
              <th>Attendance</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((r) => (
              <tr key={r.id}>
                <td><code>{r.member_id || '-'}</code></td>
                <td>
                  <div class="cell-strong">{r.student_full_name}</div>
                  <div class="cell-sub">{r.student_gender}</div>
                </td>
                <td>{r.student_class_name}</td>
                <td>
                  <div>{r.student_school}</div>
                  <div class="cell-sub">{r.student_district}</div>
                </td>
                <td>{r.preferred_venue || '-'}</td>
                <td>
                  <div style="display:flex;gap:4px;">
                    {(['present', 'late', 'absent', 'no_show'] as const).map((s) => (
                      <button
                        type="button"
                        key={s}
                        class={`btn-secondary${r.attendance_status === s ? ' btn-primary' : ''}`}
                        onClick={() => onCheckIn(r.id, s)}
                        style="padding:4px 8px;font-size:11px;"
                      >
                        {s.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ScoresTab({ scores, section, onSave, onFinalize, onExport }: {
  scores: ScoreRow[] | null;
  section: string;
  onSave: (regId: string, score: number, maxScore: number) => void;
  onFinalize: () => void;
  onExport: () => void;
}) {
  // Inline editable score row needs local state per registration. Keyed by
  // reg id so each row maintains its own input.
  const [draft, setDraft] = useState<Record<string, { score: string; max: string }>>({});

  if (!scores) return <SkRoot><SkTable headers={['Rank', 'Student', 'Class', 'Score', 'Tier']} rows={6} /></SkRoot>;

  const ranked = scores.filter((s) => s.rank != null).length;

  return (
    <>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:10px;flex-wrap:wrap;">
        <div class="muted">{scores.length} scored · {ranked} finalised in <code>{section}</code></div>
        <div style="display:flex;gap:6px;">
          <button type="button" class="btn-secondary" onClick={onExport}><Icon name="download" size={13} /> Export CSV</button>
          <button type="button" class="btn-primary" onClick={onFinalize}>Finalize ranks + winners</button>
        </div>
      </div>
      {scores.length === 0 ? (
        <div class="empty">
          <p>No scores recorded yet for <code>{section}</code>.</p>
          <p class="muted">Add scores by registration ID via the API for now (an inline-add row will land in a follow-up).</p>
        </div>
      ) : (
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Student</th>
                <th>Class</th>
                <th>Venue</th>
                <th>Score</th>
                <th>Tier</th>
                <th>Edit</th>
              </tr>
            </thead>
            <tbody>
              {scores.map((s) => {
                const key = s.registration_id + ':' + s.section;
                const d = draft[key] || { score: String(s.score), max: String(s.max_score) };
                return (
                  <tr key={s.id}>
                    <td><strong>{s.rank ?? '-'}</strong></td>
                    <td>
                      <div class="cell-strong">{s.student_full_name}</div>
                      <div class="cell-sub"><code>{s.registration_id.slice(0, 12)}</code></div>
                    </td>
                    <td>{s.student_class_name}</td>
                    <td>{s.preferred_venue || '-'}</td>
                    <td>
                      <strong>{s.score}</strong> <span class="cell-sub">/ {s.max_score}</span>
                    </td>
                    <td>
                      {s.tier ? <span class="badge badge-ok">{s.tier}</span> : <span class="muted">-</span>}
                    </td>
                    <td>
                      <div style="display:flex;gap:4px;align-items:center;">
                        <input
                          type="number"
                          value={d.score}
                          min={0}
                          style="width:64px;padding:4px 6px;font-size:13px;"
                          onInput={(e) => setDraft((s) => ({ ...s, [key]: { ...d, score: (e.target as HTMLInputElement).value } }))}
                        />
                        <span class="muted">/</span>
                        <input
                          type="number"
                          value={d.max}
                          min={1}
                          style="width:64px;padding:4px 6px;font-size:13px;"
                          onInput={(e) => setDraft((s) => ({ ...s, [key]: { ...d, max: (e.target as HTMLInputElement).value } }))}
                        />
                        <button
                          type="button" class="btn-secondary"
                          style="padding:4px 9px;font-size:11.5px;"
                          onClick={() => onSave(s.registration_id, Number(d.score) || 0, Number(d.max) || DEFAULT_MAX_SCORE)}
                        >
                          Save
                        </button>
                      </div>
                    </td>
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
