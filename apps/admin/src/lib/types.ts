// Shared view types - the shapes pages render. api.ts adapts the worker's D1
// responses into these.

export type PaymentStatus = 'paid' | 'pending' | 'failed';
export type RegStatus = 'confirmed' | 'pending' | 'cancelled';
export type ProgramStatus = 'open' | 'closed' | 'coming_soon';

export interface Registration {
  id: string;
  bdmsoId: string;
  student: string;
  studentClass: string;
  program: string;
  programSlug: string;
  district: string; // student home district
  venue: string;    // exam region (preferred division)
  school: string;   // student school
  subject: string;          // purchased subject (from program_options): math | science | both
  preferredSubject: string; // raw preferred_subject; shown when it differs from the purchased subject
  guardian: string;
  phone: string;
  email: string;
  amount: number;     // amount actually paid (0 when no payment yet)
  fee: number | null; // program's expected fee (null for option-priced/on-enquiry)
  payment: PaymentStatus;
  status: RegStatus;
  createdAt: string;
}

export interface Payment {
  id: string;
  regId: string;
  student: string;
  program: string;
  amount: number;
  method: string;            // raw rail (bKash/card/...) - used by the per-method breakdown
  methodLabel: string;       // gateway-qualified for display: "shurjoPay: bKash" / "Manual: cash"
  source: string;            // ShurjoPay | Cash | Coupon | Free - from channel, for the source filter
  accountNumber: string | null;
  status: PaymentStatus;
  txnId: string | null;
  createdAt: string;
}

export interface RegistrationPayment {
  id: string;
  amount: number;
  method: string;
  methodLabel: string;       // gateway-qualified for display
  accountNumber: string | null;
  status: PaymentStatus;
  txnId: string | null;
  couponCode: string | null;
  purpose: string;
  program: string;
  createdAt: string;
}

export interface SiblingRegistration {
  id: string;
  program: string;
  status: RegStatus;
  subject: string;
  venue: string;
  cohort: string;
  createdAt: string;
}

export interface RegistrationDetail {
  id: string;
  bdmsoId: string;
  student: string;
  dateOfBirth: string;
  studentClass: string;
  gender: string;
  medium: string;
  school: string;
  district: string;
  guardian: string;
  relationship: string;
  phone: string;
  email: string;
  address: string;
  emailVerified: boolean;
  venue: string;
  subject: string;
  cohort: string;
  source: string;
  program: string;
  status: RegStatus;
  createdAt: string;
  payments: RegistrationPayment[];
  siblings: SiblingRegistration[];
}

export interface Program {
  slug: string;
  title: string;
  category: string;
  status: ProgramStatus;
  fee: number;
  published: boolean;
}

export interface TriageItem {
  id: string;
  kind: 'failed_payment' | 'stuck_reg' | 'sponsorship' | 'expiring_coupon';
  urgency: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  link: string;
  createdAt: string;
}

export interface Activity {
  id: string;
  actor: string;
  action: string;
  target: string;
  at: string;
}

export interface Kpi {
  label: string;
  value: string;
  delta: number; // percentage change vs previous period
  spark: number[];
}

export interface DashboardData {
  kpis: Kpi[];
  attention: { stuck: number; failed: number; unverified: number };
  registrationsTrend: { date: string; confirmed: number; pending: number }[];
  byProgram: { program: string; programLabel: string; cohort: string; count: number; paid: number; revenue: number }[];
  paymentBreakdown: { status: string; count: number; fill: string }[];
  recent: Registration[];
  triage: TriageItem[];
  activity: Activity[];
}

/* ── Secondary section view types ─────────────────────────────────────────── */
export type Coupon = {
  code: string; type: 'percent' | 'flat'; value: number;
  used: number; limit: number; status: 'active' | 'expired' | 'exhausted'; expiresOn: string;
};
export type Sponsorship = {
  id: string; company: string; contact: string; email: string;
  amount: number | null; message: string; status: 'new' | 'contacted' | 'closed'; createdAt: string;
};
export type Post = { id: string; title: string; slug: string; status: 'published' | 'draft'; featured: boolean; author: string; updatedAt: string };
export type Press = { id: string; outlet: string; title: string; url: string; publishedOn: string; featured: boolean; published: boolean };
export type HofPhoto = { id: string; caption: string; year: number; published: boolean; sortOrder: number };
export type TeamMember = { id: string; name: string; role: string; section: string; affiliation: string; image: string; published: boolean };
export type User = { id: string; name: string; email: string; role: 'admin' | 'editor' | 'mentor' | 'viewer' | 'guardian'; verified: boolean; lastActive: string };
export type AuditEntry = { id: string; actor: string; action: string; target: string; at: string; payload: Record<string, unknown> };
// parts: optional per-section breakdown (e.g. ["Short Q", "Essay Q"]). When set,
// the CSV template emits one column per part, the section score is the sum of its
// parts, and the breakdown is stored/shown to guardians as detail.
export type ExamSection = { id: string; label: string; max: number; parts?: string[] };
export type ExamEvent = {
  eventKey: string; label: string; programSlug: string;
  sections: ExamSection[]; resultsPublished: boolean; publishedAt: string | null; scored: number;
};
export type ScoreCell = { score: number; max: number; rank: number | null; tier: string | null; detail: Record<string, number> | null };
export type RosterEntry = {
  id: string; memberId: string | null; name: string; className: string;
  venue: string; school: string; district: string;
  attendanceStatus: 'present' | 'absent' | 'late' | 'no_show';
  scores: Record<string, ScoreCell>;
};
export type CohortStatus = 'draft' | 'upcoming' | 'enrolling' | 'running' | 'ended' | 'archived';
export type Cohort = {
  cohortKey: string; programSlug: string; label: string; status: CohortStatus;
  enrollOpens: string | null; enrollCloses: string | null;
  startsOn: string | null; endsOn: string | null;
  priceOverride: number | null; capacity: number | null;
  sections: ExamSection[]; resultsPublished: boolean; publicFeatured: boolean;
  regs: number; paid: number;
};
export type ImportSummary = { matched: number; unmatched: number; invalid: number };
export type ImportResult = {
  committed: boolean; summary: ImportSummary;
  matched: { member_id: string; student: string; sections: number }[];
  unmatched: { member_id: string; reason: string }[];
  invalid: { member_id: string; student?: string; reason: string }[];
};
export type BroadcastRun = { id: string; subject: string; audience: string; recipients: number; opened: number; sentAt: string };
export type EmailTemplate = { id: string; name: string; subject: string; body: string; category: string; updatedAt: string };
export type Service = { name: string; status: 'ok' | 'degraded' | 'down'; hint: string; lastActivity: string };
export type ReportRow = { name: string; total: number; paid: number; revenue: number };
export type ReportTotals = { participants: number; paid: number; revenue: number; adPaid: number; adPaidPaid: number; fbOrganic: number; fbOrganicPaid: number };
