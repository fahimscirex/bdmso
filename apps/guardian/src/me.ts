// Shared /api/me loader + result types. Cached so the Shell, NotificationTicker,
// PaymentBanner, and Results page all share one fetch. Call loadMe(true) after
// mutations to bust the cache and notify all subscribers via custom event.
import { api } from './api';

export type ExamResult = {
  event_label: string;
  sections: { section: string; label: string; score: number; max: number; rank: number | null; tier: string | null }[];
  total: number;
  max_total: number;
  rank: number | null;
  tier: string | null;
};

export type ResultReg = {
  id: string;
  registration_type: string;
  program_label: string;
  student_full_name: string;
  status: 'submitted' | 'paid' | 'cancelled';
  member_id: string | null;
  payment_status: 'pending' | 'paid' | 'failed' | null;
  payment_date: string | null;
  created_at: string;
  registration_ends: string | null;
  edit_window_open: boolean;
  result: ExamResult | null;
};
export type MeLite = {
  account: { fullName: string; email: string; emailVerified: boolean };
  registrations: ResultReg[];
};
// Alias so NotificationTicker/PaymentBanner can import a stable name.
export type MeResponse = MeLite;

let cache: Promise<MeLite> | null = null;
export function loadMe(force = false): Promise<MeLite> {
  if (force || !cache) {
    cache = api.get<MeLite>('/api/me');
    // Notify subscribers (NotificationTicker, PaymentBanner) to refetch.
    if (force) window.dispatchEvent(new Event('bdmso:me-refresh'));
  }
  return cache;
}

export function tierLabel(tier: string): string {
  if (tier === 'champion') return 'Champion';
  if (tier === 'all-round') return 'All-round';
  if (tier === 'math') return 'Top in Math';
  if (tier === 'science') return 'Top in Science';
  return tier;
}
