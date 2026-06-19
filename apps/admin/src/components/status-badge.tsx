// One status/urgency language for the whole app (blueprint requirement).
// paid/published/ok = emerald, pending/contacted = amber, failed/cancelled =
// red, draft/closed/neutral = muted. Drive every Badge from this map, never
// ad-hoc pill classes.

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const TONES: Record<string, string> = {
  emerald: 'border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  amber: 'border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400',
  red: 'border-transparent bg-red-500/15 text-red-700 dark:text-red-400',
  blue: 'border-transparent bg-blue-500/15 text-blue-700 dark:text-blue-400',
  neutral: 'border-transparent bg-muted text-muted-foreground',
};

const STATUS_TONE: Record<string, keyof typeof TONES> = {
  paid: 'emerald', confirmed: 'emerald', published: 'emerald', open: 'emerald', ok: 'emerald', active: 'emerald', sent: 'emerald', verified: 'emerald',
  pending: 'amber', contacted: 'amber', coming_soon: 'amber', degraded: 'amber', high: 'amber',
  failed: 'red', cancelled: 'red', down: 'red', urgent: 'red',
  new: 'blue',
  draft: 'neutral', closed: 'neutral', exhausted: 'neutral', expired: 'neutral', low: 'neutral', unverified: 'neutral',
};

const LABELS: Record<string, string> = {
  coming_soon: 'Coming soon',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = STATUS_TONE[status] ?? 'neutral';
  const label = LABELS[status] ?? status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <Badge className={cn('font-medium capitalize tabular-nums', TONES[tone], className)}>
      {label}
    </Badge>
  );
}
