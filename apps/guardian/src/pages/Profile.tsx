// Guardian profile. Two-column layout: account info + student
// details on the left, password + sessions on the right. Student
// details are editable inline regardless of payment status -
// guardians can fix typos in school/district/gender themselves
// instead of going through support for every small correction.

import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../api';
import { BD_DISTRICTS } from '../districts';
import { syncSessionName, syncHeaderName } from '../auth';
import { Dropdown } from '../components/Dropdown';

type ProfileRow = {
  accountId: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: string;
  emailVerified: boolean;
  memberId: string | null;
};

type Registration = {
  id: string;
  registration_type: string;
  // Program label comes from the worker's /api/me (catalog-derived).
  program_label: string;
  student_full_name: string;
  student_date_of_birth: string;
  student_class_name: string;
  student_gender: string;
  student_medium: string | null;
  student_school: string;
  student_district: string;
  preferred_venue: string | null;
  status: 'submitted' | 'paid' | 'cancelled';
  member_id: string | null;
  payment_status: 'pending' | 'paid' | 'failed' | null;
};

type MeResponse = {
  ok: true;
  account: { memberId: string | null };
  registrations: Registration[];
};

// Renders an ISO date (e.g. "2013-10-02") as "2 Oct 2013". Falls back
// to the raw string if it isn't a parseable date.
function prettyDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function Profile() {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [error, setError]     = useState<string | null>(null);

  function loadProfile() {
    api.get<ProfileRow>('/api/me/profile')
      .then((p) => { setProfile(p); syncSessionName(p.fullName, p.email); })
      .catch((err: ApiError) => setError(err.message));
  }
  useEffect(loadProfile, []);

  return (
    <>
      <div class="page-header">
        <h1>Profile</h1>
        <p class="sub">Your account, your child's details, and your password.</p>
      </div>

      {error && <div class="error">{error}</div>}
      {!profile && !error && <p class="muted">Loading…</p>}

      {profile && (
        <div class="profile-grid">
          <div class="profile-col">
            <AccountCard profile={profile} onSaved={loadProfile} />
            <StudentsCard />
          </div>
          <div class="profile-col">
            <PasswordCard />
            <SessionsCard />
          </div>
        </div>
      )}
    </>
  );
}

// Resend the email-verification link. The verification mail can go
// missing (spam, blocked sender), so an unverified account gets a
// one-click resend wired to POST /api/resend-verification.
function ResendVerify() {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  async function resend() {
    setStatus('sending');
    try {
      const res = await api.post<{ ok: true; alreadyVerified?: boolean }>('/api/resend-verification', {});
      setStatus('sent');
      setMsg(res.alreadyVerified
        ? 'Your email is already verified - refresh the page.'
        : 'Verification email sent. Check your inbox and spam folder.');
    } catch (err) {
      setStatus('error');
      setMsg(err instanceof ApiError ? err.message : 'Could not send right now - try again shortly.');
    }
  }

  return (
    <div class="resend-verify">
      {status === 'sent'
        ? <span class="resend-msg ok">{msg}</span>
        : (
          <>
            <button type="button" class="resend-link" onClick={resend} disabled={status === 'sending'}>
              {status === 'sending' ? 'Sending…' : 'Resend verification email'}
            </button>
            {status === 'error' && <span class="resend-msg bad">{msg}</span>}
          </>
        )}
    </div>
  );
}

function AccountCard({ profile, onSaved }: { profile: ProfileRow; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);

  return (
    <section class="card">
      <div class="account-head">
        <h2>Account</h2>
        {!editing && (
          <button type="button" class="btn-secondary student-row-edit" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <AccountEditForm
          profile={profile}
          onCancel={() => setEditing(false)}
          onSaved={() => { setEditing(false); onSaved(); }}
        />
      ) : (
        <>
          <dl class="kv">
            <dt>Name</dt><dd>{profile.fullName}</dd>
            <dt>Email</dt><dd>
              {profile.email}{' '}
              {profile.emailVerified
                ? <span class="badge badge-ok">verified</span>
                : <>
                    <span class="badge badge-muted">unverified</span>
                    <ResendVerify />
                  </>}
            </dd>
            <dt>Phone</dt><dd>{profile.phone || <span class="muted">-</span>}</dd>
          </dl>
          <p class="muted" style="margin:14px 0 0;font-size:12.5px;">
            BdMSO IDs are issued per student - see <strong>Student Details</strong> below.
          </p>
        </>
      )}
    </section>
  );
}

function AccountEditForm({ profile, onCancel, onSaved }: {
  profile: ProfileRow;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(profile.fullName);
  const [email, setEmail]       = useState(profile.email);
  const [phone, setPhone]       = useState(profile.phone || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailChanged = email.trim().toLowerCase() !== profile.email.trim().toLowerCase();

  async function submit(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.patch<{ ok: true; emailChanged?: boolean }>('/api/me/profile', {
        fullName: fullName.trim(),
        email:    email.trim(),
        phone:    phone.trim(),
        // Changing the email requires re-authentication server-side.
        ...(emailChanged ? { current_password: currentPassword } : {}),
      });
      // Keep the marketing header's cached name in sync with the edit.
      syncSessionName(fullName.trim(), email.trim());
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save changes.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form class="student-edit" onSubmit={submit}>
      <div class="student-edit-grid">
        <Field label="Full name" full>
          <input type="text" required value={fullName}
            onInput={(e) => setFullName((e.target as HTMLInputElement).value)} />
        </Field>
        <Field label="Email" full>
          <input type="email" required value={email}
            onInput={(e) => setEmail((e.target as HTMLInputElement).value)} />
        </Field>
        <Field label="Phone" full>
          <input type="tel" value={phone}
            onInput={(e) => setPhone((e.target as HTMLInputElement).value)} />
        </Field>
      </div>
      {emailChanged && (
        <>
          <p class="muted" style="margin-top:10px;font-size:12.5px;">
            The new email address starts unverified - we'll send a verification link to it once you save.
          </p>
          <Field label="Current password" hint="Required to change your email address.">
            <input
              type="password" required autocomplete="current-password"
              value={currentPassword}
              onInput={(e) => setCurrentPassword((e.target as HTMLInputElement).value)} />
          </Field>
        </>
      )}
      {error && <div class="error" style="margin-top:10px;">{error}</div>}
      <div class="action-row" style="margin-top:14px;">
        <button type="submit" class="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
        <button type="button" class="btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

function StudentsCard() {
  const [regs, setRegs]         = useState<Registration[] | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);

  function load() {
    api.get<MeResponse>('/api/me')
      .then((d) => {
        setRegs(d.registrations);
        setMemberId(d.account?.memberId || null);
        const studentName = d.registrations.find((r) => r.status === 'paid')?.student_full_name
          || d.registrations[0]?.student_full_name;
        if (studentName) syncHeaderName(studentName);
      })
      .catch((err: ApiError) => setError(err.message));
  }

  useEffect(load, []);

  return (
    <section class="card">
      <h2>Student Details</h2>
      {error && <div class="error">{error}</div>}
      {!regs && !error && <p class="muted">Loading…</p>}

      {regs && regs.length === 0 && (
        <p class="muted" style="margin:0;">No registrations yet - once you register a child, their details appear here.</p>
      )}

      {/* One account belongs to one student - every registration is
          that same child enrolling in another program. So all rows
          render as a single student card with one chip per program. */}
      {regs && regs.length > 0 && (
        <div class="students-list">
          <StudentRow regs={regs} memberId={memberId} onSaved={load} />
        </div>
      )}
    </section>
  );
}

function StudentRow({ regs, memberId, onSaved }: { regs: Registration[]; memberId: string | null; onSaved: () => void }) {
  // The "active" representative row - prefer paid > submitted > cancelled,
  // and within that the most recent. Edits target this row; the rest
  // appear as program chips.
  const order = (r: Registration) =>
    (r.status === 'paid' ? 0 : r.status === 'submitted' ? 1 : 2);
  const sorted = [...regs].sort((a, b) => order(a) - order(b));
  const active = sorted[0];
  const [editing, setEditing] = useState(false);

  // Active (non-cancelled) registrations drive the program list.
  const activePrograms = regs.filter((r) => r.status !== 'cancelled');

  return (
    <div class="student-row">
      <div class="student-row-head">
        <div class="student-row-headinfo">
          <div class="student-row-name">{active.student_full_name}</div>
          <div class="student-row-meta">
            {active.student_class_name}
            {active.student_gender ? ` · ${active.student_gender}` : ''}
          </div>
          {memberId && (
            <div class="student-row-id">BdMSO ID <code>{memberId}</code></div>
          )}
        </div>
        <button
          type="button"
          class="btn-secondary student-row-edit"
          onClick={() => setEditing((e) => !e)}
        >
          {editing ? 'Cancel' : 'Edit'}
        </button>
      </div>

      {!editing && (
        <>
          <dl class="student-row-fields">
            <dt>Date of birth</dt><dd>{active.student_date_of_birth ? prettyDate(active.student_date_of_birth) : <span class="muted">-</span>}</dd>
            <dt>Gender</dt><dd style="text-transform:capitalize;">{active.student_gender || <span class="muted">-</span>}</dd>
            <dt>Curriculum</dt><dd style="text-transform:capitalize;">{active.student_medium || <span class="muted">-</span>}</dd>
            <dt>School</dt><dd>{active.student_school}</dd>
            <dt>District</dt><dd>{active.student_district}</dd>
            {active.preferred_venue && <><dt>Exam region</dt><dd style="text-transform:capitalize;">{active.preferred_venue}</dd></>}
          </dl>

          {activePrograms.length > 0 && (
            <div class="student-row-progs">
              <span class="student-row-progs-label">Enrolled in</span>
              <div class="student-row-progs-list">
                {activePrograms.map((r) => (
                  <span key={r.id} class="student-prog-chip" title={`Status: ${r.status}`}>
                    <span class={`student-prog-dot ${r.status === 'paid' ? 'ok' : 'warn'}`} />
                    {r.program_label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {editing && (
        <StudentEditForm
          regs={sorted}
          onCancel={() => setEditing(false)}
          onSaved={() => { setEditing(false); onSaved(); }}
        />
      )}
    </div>
  );
}

type EditForm = {
  student_full_name:     string;
  student_date_of_birth: string;
  student_class_name:    string;
  student_gender:        string;
  student_medium:        string;
  student_school:        string;
  student_district:      string;
  preferred_venue:       string;
};

const DOB_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function daysInMonth(year: number, month: number): number {
  if (!month) return 31;
  if (month === 2) return year ? new Date(year, 2, 0).getDate() : 29;
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

// Date of birth: Day number input / Month select / Year number input.
// A native <input type="date"> renders mm/dd/yyyy on US-locale
// browsers; this guarantees dd/mm/yyyy order. Number inputs avoid the
// very tall native dropdown a 31-option day <select> produces. Holds
// its own day/month/year state and reports an ISO yyyy-mm-dd string
// (or '' while incomplete/invalid) upward.
function DobSelect({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const [iy, im, id] = value ? value.split('-').map(Number) : [0, 0, 0];
  const [day, setDay]     = useState<string>(id ? String(id) : '');
  const [month, setMonth] = useState<number>(im || 0);
  const [year, setYear]   = useState<string>(iy ? String(iy) : '');

  const thisYear = new Date().getFullYear();
  const maxDay = daysInMonth(Number(year), month);

  function emit(d: string, m: number, y: string) {
    const dn = Number(d);
    const yn = Number(y);
    const valid = dn >= 1 && m >= 1 && m <= 12 && yn >= 1900 && dn <= daysInMonth(yn, m);
    onChange(valid
      ? `${yn}-${String(m).padStart(2, '0')}-${String(dn).padStart(2, '0')}`
      : '');
  }

  return (
    <div class="dob-row">
      <input
        type="number" required aria-label="Day of birth" placeholder="DD"
        min="1" max={String(maxDay)} inputmode="numeric" value={day}
        onInput={(e) => {
          const v = (e.target as HTMLInputElement).value;
          setDay(v); emit(v, month, year);
        }}
      />
      <Dropdown
        ariaLabel="Month of birth"
        placeholder="Month"
        value={month ? String(month) : ''}
        options={DOB_MONTHS.map((name, i) => ({ value: String(i + 1), label: name }))}
        onChange={(v) => { const m = Number(v); setMonth(m); emit(day, m, year); }}
      />
      <input
        type="number" required aria-label="Year of birth" placeholder="YYYY"
        min={String(thisYear - 20)} max={String(thisYear - 3)} inputmode="numeric" value={year}
        onInput={(e) => {
          const v = (e.target as HTMLInputElement).value;
          setYear(v); emit(day, month, v);
        }}
      />
    </div>
  );
}

function StudentEditForm({ regs, onCancel, onSaved }: {
  regs: Registration[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  // One student can have several registration rows (one per program),
  // each carrying its own copy of the student's details. Prefill from
  // the representative row; the save writes back to EVERY row in one
  // atomic request (PATCH /api/me/registrations) so the rows can't
  // disagree and split the student into two cards.
  const reg = regs[0];
  const [form, setForm] = useState<EditForm>({
    student_full_name:     reg.student_full_name,
    student_date_of_birth: reg.student_date_of_birth,
    student_class_name:    reg.student_class_name,
    student_gender:        reg.student_gender,
    student_medium:        reg.student_medium || '',
    student_school:        reg.student_school,
    student_district:      reg.student_district,
    preferred_venue:       reg.preferred_venue || '',
  });
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // One atomic bulk update across every registration row, so the
      // student's details can never end up half-applied.
      await api.patch<{ ok: true }>('/api/me/registrations', form);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form class="student-edit" onSubmit={submit}>
      <div class="student-edit-grid">
        <Field label="Full name">
          <input type="text" required value={form.student_full_name}
            onInput={(e) => patch('student_full_name', (e.target as HTMLInputElement).value)} />
        </Field>
        <Field label="Date of birth">
          <DobSelect
            value={form.student_date_of_birth}
            onChange={(iso) => patch('student_date_of_birth', iso)}
          />
        </Field>
        <Field label="Class">
          <Dropdown
            ariaLabel="Class"
            value={form.student_class_name}
            options={['Pre-primary', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6']
              .map((c) => ({ value: c, label: c }))}
            onChange={(v) => patch('student_class_name', v)}
          />
        </Field>
        <Field label="Gender">
          <Dropdown
            ariaLabel="Gender"
            value={form.student_gender}
            options={[
              { value: 'Male', label: 'Male' },
              { value: 'Female', label: 'Female' },
              { value: 'Other', label: 'Other' },
            ]}
            onChange={(v) => patch('student_gender', v)}
          />
        </Field>
        <Field label="Medium">
          <Dropdown
            ariaLabel="Medium"
            placeholder="- select -"
            value={form.student_medium}
            options={[
              { value: 'Bangla', label: 'Bangla' },
              { value: 'English', label: 'English' },
            ]}
            onChange={(v) => patch('student_medium', v)}
          />
        </Field>
        <Field label="District">
          <Dropdown
            ariaLabel="District"
            placeholder="Select district"
            value={form.student_district}
            options={BD_DISTRICTS.map((d) => ({ value: d, label: d }))}
            onChange={(v) => patch('student_district', v)}
          />
        </Field>
        <Field label="School" full>
          <input type="text" required value={form.student_school}
            onInput={(e) => patch('student_school', (e.target as HTMLInputElement).value)} />
        </Field>
        <Field label="Exam region" full hint="Where the student will sit the exam.">
          <Dropdown
            ariaLabel="Exam region"
            placeholder="- select -"
            value={form.preferred_venue}
            options={[
              { value: 'dhaka', label: 'Dhaka' },
              { value: 'chittagong', label: 'Chittagong' },
              { value: 'rangpur', label: 'Rangpur' },
              { value: 'sylhet', label: 'Sylhet' },
            ]}
            onChange={(v) => patch('preferred_venue', v)}
          />
        </Field>
      </div>
      {error && <div class="error" style="margin-top:10px;">{error}</div>}
      <div class="action-row" style="margin-top:14px;">
        <button type="submit" class="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
        <button type="button" class="btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState('');
  const [next,    setNext]    = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(e: Event) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (next !== confirm) { setError("New password and confirmation don't match."); return; }
    setBusy(true);
    try {
      await api.post<{ ok: true }>('/api/me/change-password', { current_password: current, new_password: next });
      setCurrent(''); setNext(''); setConfirm('');
      setSuccess('Password updated.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="card">
      <h2>Change password</h2>
      <form onSubmit={submit}>
        <div class="form-grid" style="grid-template-columns:1fr;border:none;padding:0;gap:12px;">
          <Field label="Current password">
            <input type="password" required autocomplete="current-password" value={current} onInput={(e) => setCurrent((e.target as HTMLInputElement).value)} />
          </Field>
          <Field label="New password" hint="At least 8 characters.">
            <input type="password" required autocomplete="new-password" value={next} onInput={(e) => setNext((e.target as HTMLInputElement).value)} />
          </Field>
          <Field label="Confirm new password">
            <input type="password" required autocomplete="new-password" value={confirm} onInput={(e) => setConfirm((e.target as HTMLInputElement).value)} />
          </Field>
        </div>
        {error   && <div class="error" style="margin-top:12px;">{error}</div>}
        {success && <p style="color:var(--green);margin:12px 0 0;font-size:13px;">{success}</p>}
        <div class="action-row" style="margin-top:14px;">
          <button type="submit" class="btn-primary" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button>
        </div>
      </form>
    </section>
  );
}

function SessionsCard() {
  const [busy,    setBusy]    = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  async function revoke() {
    if (!confirm('Sign out of every other device signed in as you?')) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const r = await api.post<{ ok: true; revoked: number }>('/api/me/revoke-sessions');
      setMessage(r.revoked === 0 ? 'No other sessions were active.' : `Revoked ${r.revoked} session${r.revoked === 1 ? '' : 's'}.`);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <section class="card">
      <h2>Sessions</h2>
      <p class="muted" style="margin-top:0;">
        Sign out of every other device. This device stays signed in.
      </p>
      <div class="action-row">
        <button type="button" class="btn-secondary" onClick={revoke} disabled={busy}>
          {busy ? 'Revoking…' : 'Sign out everywhere else'}
        </button>
      </div>
      {message && <p style="color:var(--green);margin:12px 0 0;font-size:13px;">{message}</p>}
      {error   && <div class="error" style="margin-top:12px;">{error}</div>}
    </section>
  );
}

function Field({ label, hint, full, children }: { label: string; hint?: string; full?: boolean; children: any }) {
  return (
    <div class={`field${full ? ' field-full' : ''}`}>
      <label>{label}</label>
      {children}
      {hint && <p class="field-hint">{hint}</p>}
    </div>
  );
}
