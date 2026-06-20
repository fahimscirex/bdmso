// Live API client - every method hits the real /api/admin/* endpoints and
// adapts the worker's D1 response shapes to the view types. Requires an admin
// token (the app gates on auth before rendering pages). Errors propagate so
// pages can show a real error state instead of masking it.

import type {
  AuditEntry, BroadcastRun, Coupon, DashboardData, EmailTemplate,
  ExamEvent, ExamSection, RosterEntry, ScoreCell, ImportResult, Cohort,
  HofPhoto, Payment, Post, Press, Program, Registration, RegistrationDetail,
  RegistrationPayment, ReportRow, ReportTotals, Service, Sponsorship, TeamMember, TriageItem, User,
} from './types';
import { bdt, num } from './format';
import { http } from './http';

export type { ReportRow } from './types';

/* ── Real response shapes (subset we consume) ─────────────────────────────── */
type RegRow = {
  id: string; bdmso_id: string | null; registration_type: string; program_label: string;
  student_full_name: string; student_class_name: string; student_district: string; student_school: string | null;
  preferred_venue: string | null; preferred_subject: string | null; program_options: string | null;
  guardian_full_name: string; guardian_phone: string; guardian_email: string | null;
  status: 'submitted' | 'paid' | 'cancelled'; created_at: string;
  payment_status: 'pending' | 'paid' | 'failed' | null; payment_amount: number | null; fee_amount: number | null;
};
type PayRow = {
  id: string; amount: number; tran_id: string; status: 'pending' | 'paid' | 'failed';
  method: string | null; account_number: string | null; channel: string | null;
  coupon_code: string | null; created_at: string; registration_id: string | null;
  student_full_name: string | null; program_label: string | null;
};
type DetailRow = {
  id: string; registration_type: string;
  student_full_name: string; student_date_of_birth: string; student_class_name: string;
  student_gender: string; student_medium: string; student_school: string; student_district: string;
  guardian_full_name: string; guardian_relationship: string; guardian_phone: string;
  guardian_email: string; guardian_address: string; guardian_email_verified: number;
  preferred_venue: string | null; preferred_subject: string | null; program_options: string | null;
  status: 'submitted' | 'paid' | 'cancelled'; created_at: string;
  member_id: string | null; account_member_id: string | null;
};
type DetailPayRow = {
  id: string; amount: number; tran_id: string | null; status: 'pending' | 'paid' | 'failed';
  method: string | null; account_number: string | null; channel: string | null; coupon_code: string | null; purpose: string; program: string; created_at: string;
};
type ProgRow = {
  slug: string; title: string; category: string; registration_status: string;
  fee_amount: number | null; published: boolean; updated_at: string;
};
type TriageItemRow = {
  kind: 'failed_payment' | 'stuck_reg' | 'sponsorship' | 'expiring_coupon';
  id: string; urgency: 'high' | 'medium' | 'low'; title: string; detail: string; timestamp: string | null; link: string;
};
type AuditRow = { id: string; account_email: string | null; action: string; target_type: string | null; target_id: string | null; payload_json: string | null; created_at: string };
type CouponRow = { code: string; discount_type: 'percent' | 'fixed'; discount_value: number; max_uses: number | null; used_count: number; expires_at: string | null };
type SponsorRow = { id: string; organization: string; contact_person: string; email: string; message: string; status: 'new' | 'contacted' | 'closed'; created_at: string };
type UserRow = { id: string; email: string; full_name: string; email_verified: number; role: 'guardian' | 'admin' | 'editor' | 'mentor'; created_at: string };
type PostRow = { slug: string; title: string; author: string; published: boolean; featured: boolean; updated_at: string };
type PressRow = { id: number; outlet: string; title: string; url: string; published_on: string; featured: boolean; published: boolean };
type HofRow = { id: number; caption: string; year: string; sort_order: number; published: boolean };
type TeamRow = { id: number; section: string; name: string; role: string; affiliation: string; image: string; published: boolean };
type TemplateRow = { id: number; name: string; subject: string; body: string; category: string | null; updated_at: string };
type BroadcastLogRow = { id: number; subject: string; filters_json: string | null; recipient_count: number; sent_count: number; sent_at: string };
type ExamEventRow = { event_key: string; label: string; program_slug: string; sections: ExamSection[]; results_published: boolean; published_at: string | null; scored: number };
type CohortRow = {
  cohort_key: string; program_slug: string; label: string; status: Cohort['status'];
  enroll_opens: string | null; enroll_closes: string | null; starts_on: string | null; ends_on: string | null;
  price_override: number | null; capacity: number | null; sections: ExamSection[]; results_published: boolean; public_featured: boolean;
  regs: number; paid: number;
};
type RosterRow = {
  id: string; member_id: string | null; student_full_name: string; student_class_name: string;
  preferred_venue: string | null; student_school: string | null; student_district: string | null;
  attendance_status: 'present' | 'absent' | 'late' | 'no_show';
  scores: Record<string, ScoreCell>;
};
type HealthService = { ok: boolean; hint: string };
type SystemHealthResp = {
  services: { d1: HealthService; assets: HealthService; shurjopay: HealthService; brevo: HealthService; email_from: HealthService };
  environment: string;
  timestamps: { last_paid_payment: string | null; last_registration: string | null; last_broadcast: string | null };
};
export type PendingPublish = {
  ok: boolean;
  count: number;
  changes: { id: string; entity_type: string; entity_id: string; action: 'create' | 'update' | 'delete'; title: string; path: string; staged_at: string }[];
  suggestedMessage: string;
};
type RegSummary = { total: number; paid: number; pending: number; cancelled: number };
type PaySummary = { total: number; paid: number; pending: number; failed: number; revenue: number };
type Analytics = {
  byProgram: { type: string; program_label: string; cohort: string; label: string; total: number; paid: number; revenue: number }[];
  byVenue: { venue: string; total: number; paid: number; revenue: number }[];
  attention: { stuck_unpaid: number; recent_failed: number; unread_sponsorships: number; expiring_coupons: number };
  deltas: { reg_today: number; reg_yesterday: number; paid_today: number; paid_yesterday: number; rev_today: number; rev_yesterday: number; pending_today: number; pending_yesterday: number };
  series: { registrations: { day: string; total: number; paid: number }[]; payments: { day: string; count: number; revenue: number }[] };
  revenue: number;        // lifetime gateway (online) collection
  cashCollected: number;  // lifetime cash / manual collection
};

/* ── Content editor record shapes (full records returned for editing) ─────── */
type PostBody = {
  slug: string; title: string; excerpt: string; category: string; author: string;
  image: string; published: boolean; featured: boolean; published_at: string | null; body_md: string;
};
type ProgramBody = {
  slug: string; title: string; category: string; registration_status: string;
  registration_opens: string | null; registration_closes: string | null; schedule_label: string;
  starts_on: string | null; ends_on: string | null; price_label: string; fee_amount: number | null;
  tagline: string; eyebrow: string; image: string; audience: string; duration: string; format: string;
  outcome: string; level: string; meta_description: string; home_order: string;
  register_url: string; register_label: string;
  hidden: boolean; repeatable: boolean; always_open: boolean; published: boolean; body_md: string;
  pricing: ProgramPricing | null;
};
type ProgramPricing = {
  selection: 'single' | 'multiple';
  choices: { id: string; label: string; note: string; price: number }[];
};
type PressBody = {
  id: string; outlet: string; title: string; url: string; published_on: string;
  image: string; featured: boolean; sort_order: number; published: boolean;
};
type HofBody = { id: string; image: string; caption: string; year: string; sort_order: number; published: boolean };
type TeamBody = {
  id: string; section: string; subgroup: string; year: string; name: string; role: string;
  affiliation: string; image: string; sort_order: number; published: boolean;
};

/* ── Adapters: real shape -> view type ────────────────────────────────────── */
// Subject is stored in preferred_subject only for the Olympiad; other programs
// (prep course/camp) carry it as a math/science/both id in program_options.
const SUBJECT_IDS = new Set(['math', 'science', 'both']);
function deriveSubject(preferred: string | null, optionsJson: string | null): string {
  // program_options reflects the option actually purchased, so it wins over
  // preferred_subject - which can go stale when the chosen option changes
  // (e.g. preferred='science' left behind after upgrading to 'both', so the
  // ৳1500 "both" payment was being mislabelled as just "Science").
  try {
    const ids = JSON.parse(optionsJson || '[]');
    if (Array.isArray(ids)) {
      const s = ids.find((x) => typeof x === 'string' && SUBJECT_IDS.has(x));
      if (s) return s;
    }
  } catch { /* malformed json */ }
  return preferred || '—';
}
const regStatus = (s: RegRow['status']): Registration['status'] => (s === 'paid' ? 'confirmed' : s === 'cancelled' ? 'cancelled' : 'pending');
function adaptReg(r: RegRow): Registration {
  return {
    id: r.id, bdmsoId: r.bdmso_id ?? '—', student: r.student_full_name, studentClass: r.student_class_name,
    program: r.program_label, programSlug: r.registration_type,
    district: r.student_district || '—', venue: r.preferred_venue || '—', school: r.student_school || '—',
    subject: deriveSubject(r.preferred_subject, r.program_options),
    preferredSubject: r.preferred_subject || '',
    guardian: r.guardian_full_name, phone: r.guardian_phone, email: r.guardian_email ?? '—',
    amount: r.payment_amount ?? 0, fee: r.fee_amount ?? null, payment: r.payment_status ?? 'pending',
    status: regStatus(r.status), createdAt: r.created_at,
  };
}
// Gateway-qualified method label: online rails read "shurjoPay: bKash" so they
// can't be mistaken for an offline "bKash" transfer ("Manual: bKash"). 'manual'
// as a method value (the offline-invoice placeholder) is treated as no rail.
function formatMethod(channel: string | null, method: string | null, coupon: string | null): string {
  const rail = method && method.toLowerCase() !== 'manual' ? method : null;
  if (!rail) return coupon ? 'Coupon' : channel === 'manual' ? 'Manual' : 'shurjoPay';
  return channel === 'manual' ? `Manual: ${rail}` : `shurjoPay: ${rail}`;
}
function adaptPay(r: PayRow): Payment {
  return { id: r.id, regId: r.registration_id ?? '—', student: r.student_full_name ?? '—', program: r.program_label ?? '—', amount: r.amount, method: r.method || (r.coupon_code ? 'Coupon' : 'shurjoPay'), methodLabel: formatMethod(r.channel, r.method, r.coupon_code), accountNumber: r.account_number || null, status: r.status, txnId: r.tran_id || null, createdAt: r.created_at };
}
function adaptRegPayment(r: DetailPayRow): RegistrationPayment {
  return {
    id: r.id, amount: r.amount,
    method: r.method || (r.coupon_code ? 'Coupon' : 'shurjoPay'),
    methodLabel: formatMethod(r.channel, r.method, r.coupon_code),
    accountNumber: r.account_number || null,
    status: r.status, txnId: r.tran_id || null, couponCode: r.coupon_code,
    purpose: r.purpose, program: r.program, createdAt: r.created_at,
  };
}
function adaptRegDetail(r: DetailRow, payments: DetailPayRow[]): RegistrationDetail {
  return {
    id: r.id, bdmsoId: r.account_member_id ?? r.member_id ?? '—',
    student: r.student_full_name, dateOfBirth: r.student_date_of_birth,
    studentClass: r.student_class_name, gender: r.student_gender, medium: r.student_medium,
    school: r.student_school, district: r.student_district,
    guardian: r.guardian_full_name, relationship: r.guardian_relationship,
    phone: r.guardian_phone, email: r.guardian_email, address: r.guardian_address,
    emailVerified: r.guardian_email_verified === 1,
    venue: r.preferred_venue || '—', subject: deriveSubject(r.preferred_subject, r.program_options),
    program: r.registration_type, status: regStatus(r.status), createdAt: r.created_at,
    payments: payments.map(adaptRegPayment),
  };
}
function adaptProg(r: ProgRow): Program {
  const status: Program['status'] = r.registration_status === 'open' ? 'open' : r.registration_status === 'coming_soon' ? 'coming_soon' : 'closed';
  return { slug: r.slug, title: r.title, category: r.category || '—', status, fee: r.fee_amount ?? 0, published: !!r.published };
}
function adaptTriage(i: TriageItemRow): TriageItem {
  return { id: i.id, kind: i.kind, urgency: i.urgency, title: i.title, detail: i.detail, link: i.link, createdAt: i.timestamp ?? new Date().toISOString() };
}
function adaptCoupon(r: CouponRow): Coupon {
  const expired = r.expires_at ? new Date(r.expires_at).getTime() < Date.now() : false;
  const exhausted = r.max_uses != null && r.used_count >= r.max_uses;
  return { code: r.code, type: r.discount_type === 'fixed' ? 'flat' : 'percent', value: r.discount_value, used: r.used_count, limit: r.max_uses ?? 0, status: expired ? 'expired' : exhausted ? 'exhausted' : 'active', expiresOn: r.expires_at ?? '' };
}
function adaptSponsor(r: SponsorRow): Sponsorship {
  return { id: r.id, company: r.organization, contact: r.contact_person, email: r.email, amount: null, message: r.message, status: r.status, createdAt: r.created_at };
}
function adaptUser(r: UserRow): User {
  const role: User['role'] = r.role === 'admin' ? 'admin' : r.role === 'editor' ? 'editor' : r.role === 'mentor' ? 'mentor' : r.role === 'guardian' ? 'guardian' : 'viewer';
  return { id: r.id, name: r.full_name, email: r.email, role, verified: r.email_verified === 1, lastActive: r.created_at };
}
function adaptAudit(r: AuditRow): AuditEntry {
  let payload: Record<string, unknown> = {};
  try { payload = r.payload_json ? JSON.parse(r.payload_json) : {}; } catch { payload = { raw: r.payload_json }; }
  return { id: r.id, actor: r.account_email ?? 'system', action: r.action, target: r.target_id || r.target_type || '—', at: r.created_at, payload };
}
function adaptPost(r: PostRow): Post {
  return { id: r.slug, title: r.title, slug: r.slug, status: r.published ? 'published' : 'draft', featured: r.featured, author: r.author, updatedAt: r.updated_at };
}
function adaptPress(r: PressRow): Press {
  return { id: String(r.id), outlet: r.outlet, title: r.title, url: r.url, publishedOn: r.published_on, featured: r.featured, published: r.published };
}
function adaptHof(r: HofRow): HofPhoto {
  return { id: String(r.id), caption: r.caption, year: Number(r.year) || 0, published: r.published, sortOrder: r.sort_order };
}
function adaptTeam(r: TeamRow): TeamMember {
  // Keep the raw (lowercase) section so the section filter matches; the card
  // badge capitalizes it for display.
  return { id: String(r.id), name: r.name, role: r.role, section: r.section || '—', affiliation: r.affiliation, image: r.image || '', published: r.published };
}
function adaptTemplate(r: TemplateRow): EmailTemplate {
  return { id: String(r.id), name: r.name, subject: r.subject, body: r.body || '', category: r.category || 'General', updatedAt: r.updated_at };
}
function adaptBroadcast(r: BroadcastLogRow): BroadcastRun {
  let audience = 'All';
  try {
    if (r.filters_json) {
      const f = JSON.parse(r.filters_json) as { status?: string; program?: string; region?: string };
      audience = f.status ? `${f.status} payments` : f.program || f.region || 'Filtered';
    }
  } catch { audience = 'Filtered'; }
  return { id: String(r.id), subject: r.subject, audience, recipients: r.recipient_count, opened: r.sent_count, sentAt: r.sent_at };
}
function adaptExamEvent(r: ExamEventRow): ExamEvent {
  return {
    eventKey: r.event_key, label: r.label, programSlug: r.program_slug,
    sections: r.sections || [], resultsPublished: r.results_published,
    publishedAt: r.published_at, scored: r.scored,
  };
}
function adaptCohort(r: CohortRow): Cohort {
  return {
    cohortKey: r.cohort_key, programSlug: r.program_slug, label: r.label, status: r.status,
    enrollOpens: r.enroll_opens, enrollCloses: r.enroll_closes, startsOn: r.starts_on, endsOn: r.ends_on,
    priceOverride: r.price_override, capacity: r.capacity, sections: r.sections || [],
    resultsPublished: r.results_published, publicFeatured: r.public_featured, regs: r.regs, paid: r.paid,
  };
}
function adaptRoster(r: RosterRow): RosterEntry {
  return {
    id: r.id, memberId: r.member_id, name: r.student_full_name, className: r.student_class_name,
    venue: r.preferred_venue || '—', school: r.student_school || '—', district: r.student_district || '—',
    attendanceStatus: r.attendance_status, scores: r.scores || {},
  };
}
function adaptHealth(s: SystemHealthResp): Service[] {
  const t = s.timestamps.last_registration || s.timestamps.last_paid_payment || new Date().toISOString();
  const mk = (name: string, svc: HealthService): Service => ({ name, status: svc.ok ? 'ok' : 'degraded', hint: svc.hint, lastActivity: t });
  return [mk('D1 database', s.services.d1), mk('Static assets', s.services.assets), mk('shurjoPay gateway', s.services.shurjopay), mk('Brevo email', s.services.brevo), mk('Email sender', s.services.email_from)];
}

const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 1000) / 10 : 0);

export const api = {
  // GET /api/admin/analytics (+ summaries, audit, recent regs, triage)
  async getDashboard(): Promise<DashboardData> {
    const [regS, payS, an, audit, recent, tri] = await Promise.all([
      http.get<{ summary: RegSummary }>('/api/admin/registrations?limit=1'),
      http.get<{ summary: PaySummary }>('/api/admin/payments?limit=1'),
      http.get<Analytics>('/api/admin/analytics'),
      http.get<{ rows: AuditRow[] }>('/api/admin/audit?limit=6'),
      http.get<{ rows: RegRow[] }>('/api/admin/registrations?limit=6'),
      http.get<{ items: TriageItemRow[] }>('/api/admin/triage'),
    ]);
    const regSpark = an.series.registrations.map((s) => s.total);
    const revSpark = an.series.payments.map((s) => s.revenue);
    return {
      kpis: [
        { label: 'Total registrations', value: num(regS.summary.total), delta: pct(an.deltas.reg_today, an.deltas.reg_yesterday), spark: regSpark.length ? regSpark : [0] },
        { label: 'Pending payments', value: num(payS.summary.pending), delta: pct(an.deltas.pending_today, an.deltas.pending_yesterday), spark: revSpark.length ? revSpark : [0] },
        { label: 'shurjoPay collection', value: bdt(an.revenue), delta: pct(an.deltas.rev_today, an.deltas.rev_yesterday), spark: revSpark.length ? revSpark : [0] },
        { label: 'Cash collection', value: bdt(an.cashCollected), delta: 0, spark: [0] },
      ],
      attention: { stuck: an.attention.stuck_unpaid, failed: an.attention.recent_failed, unverified: an.attention.expiring_coupons },
      registrationsTrend: an.series.registrations.map((s) => ({ date: s.day, confirmed: s.paid, pending: Math.max(0, s.total - s.paid) })),
      byProgram: an.byProgram.map((p) => ({ program: p.label, programLabel: p.program_label, cohort: p.cohort, count: p.total, paid: p.paid, revenue: p.revenue })),
      paymentBreakdown: [
        { status: 'paid', count: payS.summary.paid, fill: 'var(--color-paid)' },
        { status: 'pending', count: payS.summary.pending, fill: 'var(--color-pending)' },
        { status: 'failed', count: payS.summary.failed, fill: 'var(--color-failed)' },
      ],
      recent: recent.rows.map(adaptReg),
      triage: tri.items.map(adaptTriage).slice(0, 5),
      activity: audit.rows.map((a) => ({ id: a.id, actor: a.account_email ?? 'system', action: a.action, target: a.target_id || a.target_type || '—', at: a.created_at })),
    };
  },
  async listRegistrations(): Promise<Registration[]> { return (await http.get<{ rows: RegRow[] }>('/api/admin/registrations?limit=1000')).rows.map(adaptReg); },
  async getRegistrationDetail(id: string): Promise<RegistrationDetail> {
    const r = await http.get<{ registration: DetailRow; payments: DetailPayRow[] }>(`/api/admin/registrations/${id}`);
    return adaptRegDetail(r.registration, r.payments);
  },
  async listPayments(): Promise<Payment[]> { return (await http.get<{ rows: PayRow[] }>('/api/admin/payments?limit=1000')).rows.map(adaptPay); },
  async listPrograms(): Promise<Program[]> { return (await http.get<{ rows: ProgRow[] }>('/api/admin/programs')).rows.map(adaptProg); },
  async listTriage(): Promise<TriageItem[]> { return (await http.get<{ items: TriageItemRow[] }>('/api/admin/triage')).items.map(adaptTriage); },
  async listCoupons(): Promise<Coupon[]> { return (await http.get<{ rows: CouponRow[] }>('/api/admin/coupons?limit=500')).rows.map(adaptCoupon); },
  async listSponsorships(): Promise<Sponsorship[]> { return (await http.get<{ rows: SponsorRow[] }>('/api/admin/sponsorships?limit=500')).rows.map(adaptSponsor); },
  async listUsers(): Promise<User[]> { return (await http.get<{ rows: UserRow[] }>('/api/admin/users?limit=500')).rows.map(adaptUser); },
  async listAudit(): Promise<AuditEntry[]> { return (await http.get<{ rows: AuditRow[] }>('/api/admin/audit?limit=200')).rows.map(adaptAudit); },
  async listPosts(): Promise<Post[]> { return (await http.get<{ rows: PostRow[] }>('/api/admin/posts')).rows.map(adaptPost); },
  async listPress(): Promise<Press[]> { return (await http.get<{ rows: PressRow[] }>('/api/admin/press-mentions')).rows.map(adaptPress); },
  async listHallOfFame(): Promise<HofPhoto[]> { return (await http.get<{ rows: HofRow[] }>('/api/admin/hall-of-fame')).rows.map(adaptHof); },
  async listTeam(): Promise<TeamMember[]> { return (await http.get<{ rows: TeamRow[] }>('/api/admin/team')).rows.map(adaptTeam); },
  async listExamEvents(): Promise<ExamEvent[]> {
    return (await http.get<{ rows: ExamEventRow[] }>('/api/admin/events')).rows.map(adaptExamEvent);
  },
  async listCohorts(): Promise<Cohort[]> {
    return (await http.get<{ rows: CohortRow[] }>('/api/admin/cohorts')).rows.map(adaptCohort);
  },
  async getRoster(eventKey: string): Promise<{ sections: ExamSection[]; rows: RosterEntry[] }> {
    const r = await http.get<{ sections: ExamSection[]; rows: RosterRow[] }>(`/api/admin/events/${encodeURIComponent(eventKey)}/roster`);
    return { sections: r.sections || [], rows: r.rows.map(adaptRoster) };
  },
  async listRegions(): Promise<string[]> { return (await http.get<{ regions: string[] }>('/api/admin/regions')).regions; },
  async listBroadcasts(): Promise<BroadcastRun[]> { return (await http.get<{ rows: BroadcastLogRow[] }>('/api/admin/broadcast/log')).rows.map(adaptBroadcast); },
  async listEmailTemplates(): Promise<EmailTemplate[]> { return (await http.get<{ rows: TemplateRow[] }>('/api/admin/templates')).rows.map(adaptTemplate); },
  async listServices(): Promise<Service[]> { return adaptHealth(await http.get<SystemHealthResp>('/api/admin/system')); },
  async getReports(cohort?: string): Promise<{ totals: ReportTotals; program: ReportRow[]; region: ReportRow[] }> {
    // Lifetime ledger by default; a cohort key scopes every figure to one run.
    // Totals reconcile to SUM(paid payments); only programs with regs appear.
    const qs = cohort ? `?cohort=${encodeURIComponent(cohort)}` : '';
    const r = await http.get<{ totals: ReportTotals; byProgram: ReportRow[]; byVenue: ReportRow[] }>(`/api/admin/reports${qs}`);
    return { totals: r.totals, program: r.byProgram, region: r.byVenue };
  },

  // Live sidebar badge counts, keyed by nav url.
  async getNavCounts(): Promise<Record<string, number>> {
    const [tri, reg, pay, spo] = await Promise.all([
      http.get<{ counts: { total: number } }>('/api/admin/triage'),
      http.get<{ summary: RegSummary }>('/api/admin/registrations?limit=1'),
      http.get<{ summary: PaySummary }>('/api/admin/payments?limit=1'),
      http.get<{ summary: { unread: number } }>('/api/admin/sponsorships?limit=1'),
    ]);
    return {
      '/triage': tri.counts?.total ?? 0,
      '/registrations': reg.summary.pending,
      '/payments': pay.summary.failed,
      '/sponsorships': spo.summary.unread,
    };
  },

  /* ── Mutations ──────────────────────────────────────────────────────────── */
  registrationStatus: (id: string, status: 'submitted' | 'paid' | 'cancelled') => http.patch(`/api/admin/registrations/${id}/status`, { status }),
  bulkRemind: (ids: string[]) => http.post<{ sent: number; failed: number }>('/api/admin/registrations/bulk/remind', { ids }),
  bulkCancel: (ids: string[]) => http.post<{ cancelled: number }>('/api/admin/registrations/bulk/cancel', { ids }),
  paymentSetStatus: (id: string, status: 'paid' | 'pending' | 'failed') => http.patch(`/api/admin/payments/${id}/status`, { status }),
  paymentResendReceipt: (id: string) => http.post(`/api/admin/payments/${id}/resend-receipt`),
  paymentReconcile: (id: string) => http.post(`/api/admin/payments/${id}/reconcile`),
  reverifyAllPending: () => http.post<{ ok: true; checked: number; paid: number; failed: number }>('/api/admin/payments/reconcile-stale', { all: true }),
  paymentComplete: (id: string, method = 'cash', accountNumber?: string) => http.patch(`/api/admin/payments/${id}/complete`, { method, accountNumber }),
  // Record an offline payment against a registration: completes its pending
  // payment or creates a paid one if there is none. Confirms the reg, mints the
  // BdMSO id, sends the receipt, and counts as Cash collection.
  recordPayment: (regId: string, body: { method: string; amount?: number; accountNumber?: string }) =>
    http.post(`/api/admin/registrations/${regId}/record-payment`, body),
  registrationUpdate: (id: string, body: Record<string, unknown>) => http.patch(`/api/admin/registrations/${id}`, body),
  userUpdate: (id: string, body: Record<string, unknown>) => http.patch(`/api/admin/users/${id}`, body),
  programPublish: (slug: string, published: boolean) => http.patch(`/api/admin/programs/${encodeURIComponent(slug)}`, { published }),
  postPublish: (slug: string, published: boolean) => http.patch(`/api/admin/posts/${encodeURIComponent(slug)}`, { published }),
  pressPublish: (id: string, published: boolean) => http.patch(`/api/admin/press-mentions/${id}`, { published }),
  hofPublish: (id: string, published: boolean) => http.patch(`/api/admin/hall-of-fame/${id}`, { published }),
  teamPublish: (id: string, published: boolean) => http.patch(`/api/admin/team/${id}`, { published }),
  couponExpire: (code: string) => http.patch(`/api/admin/coupons/${code}`, { expire: true }),
  couponCreate: (body: Record<string, unknown>) => http.post<{ ok: true; code: string }>('/api/admin/coupons', body),
  couponUpdate: (code: string, body: Record<string, unknown>) => http.patch(`/api/admin/coupons/${encodeURIComponent(code)}`, body),
  couponDelete: (code: string) => http.del(`/api/admin/coupons/${encodeURIComponent(code)}`),
  triageSnooze: (kind: string, id: string, hours: number) => http.post('/api/admin/triage/snooze', { kind, id, hours }),
  triageDismiss: (kind: string, id: string) => http.post('/api/admin/triage/dismiss', { kind, id }),
  templateCreate: (body: Record<string, unknown>) => http.post<{ ok: true; id: number }>('/api/admin/templates', body),
  templateUpdate: (id: string, body: Record<string, unknown>) => http.patch(`/api/admin/templates/${id}`, body),
  templateDelete: (id: string) => http.del(`/api/admin/templates/${id}`),
  userRole: (id: string, role: string) => http.patch(`/api/admin/users/${id}/role`, { role }),
  userResetPassword: (id: string) => http.post(`/api/admin/users/${id}/send-password-reset`, {}),
  sponsorshipStatus: (id: string, status: string) => http.patch(`/api/admin/sponsorships/${id}/status`, { status }),
  eventCheckin: (key: string, regId: string, status: string) => http.post(`/api/admin/events/${encodeURIComponent(key)}/checkin`, { registration_id: regId, status }),
  saveScore: (key: string, body: { registration_id: string; section: string; score: number; max_score: number }) =>
    http.post(`/api/admin/events/${encodeURIComponent(key)}/scores`, body),
  importScores: (key: string, rows: { member_id: string; scores: Record<string, number | string>; detail?: Record<string, Record<string, number>> }[], commit: boolean) =>
    http.post<ImportResult>(`/api/admin/events/${encodeURIComponent(key)}/scores/import`, { rows, commit }),
  finalizeSection: (key: string, section: string, tierTop: number) =>
    http.post(`/api/admin/events/${encodeURIComponent(key)}/scores/finalize`, { section, tier_top: tierTop }),
  publishResults: (key: string, published: boolean) =>
    http.post(`/api/admin/events/${encodeURIComponent(key)}/publish`, { published }),
  cohortOpen: (body: unknown) => http.post<{ ok: true; cohort_key: string }>('/api/admin/cohorts', body),
  cohortUpdate: (key: string, body: unknown) => http.patch(`/api/admin/cohorts/${encodeURIComponent(key)}`, body),
  cohortFeature: (key: string, featured: boolean) =>
    http.post<{ ok: true; featured: boolean; generated: number }>(`/api/admin/cohorts/${encodeURIComponent(key)}/feature`, { featured }),
  cohortDelete: (key: string) => http.del(`/api/admin/cohorts/${encodeURIComponent(key)}`),
  broadcastRecipients: (qs: string) => http.get<{ count: number }>(`/api/admin/broadcast/recipients${qs}`),
  broadcastSend: (body: unknown) => http.post<{ ok: true; recipients: number; sent: number; failed: number }>('/api/admin/broadcast', body),
  postDelete: (slug: string) => http.del(`/api/admin/posts/${encodeURIComponent(slug)}`),
  pressDelete: (id: string) => http.del(`/api/admin/press-mentions/${id}`),
  hofDelete: (id: string) => http.del(`/api/admin/hall-of-fame/${id}`),
  teamDelete: (id: string) => http.del(`/api/admin/team/${id}`),
  programDelete: (slug: string) => http.del(`/api/admin/programs/${encodeURIComponent(slug)}`),

  // Content create/update. Payloads are field maps validated by the worker.
  // getPostBody/getProgramBody fetch the full record (incl. markdown) for editing.
  // Image upload: commits the file into the repo source and returns its logical
  // url (/assets/uploads/...). prefix is a folder like 'posts' | 'programs'.
  uploadImage: (file: File, prefix: string) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('prefix', prefix);
    return http.upload<{ url: string; key: string }>('/api/admin/uploads', fd);
  },
  getPostBody: (slug: string) => http.get<{ post: PostBody }>(`/api/admin/posts/${encodeURIComponent(slug)}`).then((r) => r.post),
  postCreate: (body: Record<string, unknown>) => http.post('/api/admin/posts', body),
  postUpdate: (slug: string, body: Record<string, unknown>) => http.patch(`/api/admin/posts/${encodeURIComponent(slug)}`, body),
  getProgramBody: (slug: string) => http.get<{ program: ProgramBody }>(`/api/admin/programs/${encodeURIComponent(slug)}`).then((r) => r.program),
  programCreate: (body: Record<string, unknown>) => http.post('/api/admin/programs', body),
  programUpdate: (slug: string, body: Record<string, unknown>) => http.patch(`/api/admin/programs/${encodeURIComponent(slug)}`, body),
  getPressBody: (id: string) => http.get<{ item: PressBody }>(`/api/admin/press-mentions/${id}`).then((r) => r.item),
  pressCreate: (body: Record<string, unknown>) => http.post('/api/admin/press-mentions', body),
  pressUpdate: (id: string, body: Record<string, unknown>) => http.patch(`/api/admin/press-mentions/${id}`, body),
  getHofBody: (id: string) => http.get<{ item: HofBody }>(`/api/admin/hall-of-fame/${id}`).then((r) => r.item),
  hofCreate: (body: Record<string, unknown>) => http.post('/api/admin/hall-of-fame', body),
  hofUpdate: (id: string, body: Record<string, unknown>) => http.patch(`/api/admin/hall-of-fame/${id}`, body),
  getTeamBody: (id: string) => http.get<{ item: TeamBody }>(`/api/admin/team/${id}`).then((r) => r.item),
  teamCreate: (body: Record<string, unknown>) => http.post('/api/admin/team', body),
  teamUpdate: (id: string, body: Record<string, unknown>) => http.patch(`/api/admin/team/${id}`, body),

  // Staged publish: the worker collects unpublished content edits, then commits
  // and pushes the materialized .md files to the repo on publish.
  getPendingPublish: () => http.get<PendingPublish>('/api/admin/publish/pending'),
  publishChanges: (message: string) => http.post<{ ok: true; commit: string; files: number }>('/api/admin/publish', { message }),
  discardPending: () => http.post('/api/admin/publish/discard'),
};
