import { useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Clock, MoreHorizontal, ShieldAlert, Ticket,
} from 'lucide-react';
import { toast } from 'sonner';
import type { TriageItem } from '@/lib/types';
import { api } from '@/lib/api';
import { useList } from '@/hooks/use-list';
import { useRouter } from '@/router';
import { relativeTime } from '@/lib/format';
import { ListError } from '@/components/list-error';
import { PageHeader } from '@/components/page-header';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';

const KIND_META: Record<TriageItem['kind'], { icon: typeof Clock; tone: string; label: string }> = {
  failed_payment:  { icon: AlertTriangle, tone: 'bg-red-500/15 text-red-600 dark:text-red-400', label: 'Failed payments' },
  stuck_reg:       { icon: Clock, tone: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', label: 'Stuck registrations' },
  sponsorship:     { icon: ShieldAlert, tone: 'bg-sky-500/15 text-sky-600 dark:text-sky-400', label: 'Sponsorships' },
  expiring_coupon: { icon: Ticket, tone: 'bg-violet-500/15 text-violet-600 dark:text-violet-400', label: 'Expiring coupons' },
};

export function TriagePage() {
  const { navigate } = useRouter();
  const { data: items, error, reload, setData: setItems } = useList(api.listTriage);
  const [dismissing, setDismissing] = useState<TriageItem | null>(null);

  // Optimistically drop the item, then persist via the worker. On failure put
  // it back (reload) so the queue stays truthful across reloads/other admins.
  const mutate = (item: TriageItem, p: Promise<unknown>, msg: string) => {
    setItems((cur) => (cur ?? []).filter((i) => i.id !== item.id));
    p.then(() => toast.success(msg)).catch((e) => {
      toast.error('Action failed', { description: (e as Error).message });
      reload();
    });
  };
  const snooze = (item: TriageItem, hours: number, msg: string) =>
    mutate(item, api.triageSnooze(item.kind, item.id, hours), msg);
  const dismiss = (item: TriageItem) =>
    mutate(item, api.triageDismiss(item.kind, item.id), 'Item dismissed');

  const openItem = (item: TriageItem) => navigate(item.link);

  return (
    <>
      <PageHeader title="Triage" description="Everything that needs a human decision, most urgent first." />

      {error && <ListError message={error} onRetry={reload} />}

      {items && items.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(['failed_payment', 'stuck_reg', 'sponsorship', 'expiring_coupon'] as TriageItem['kind'][])
            .map((kind) => ({ kind, count: items.filter((i) => i.kind === kind).length }))
            .filter(({ count }) => count > 0)
            .map(({ kind, count }) => {
              const meta = KIND_META[kind];
              const Icon = meta.icon;
              return (
                <div key={kind} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
                  <span className={`flex size-8 shrink-0 items-center justify-center rounded-md ${meta.tone}`}><Icon className="size-4" /></span>
                  <div>
                    <div className="text-lg font-semibold leading-none tabular-nums">{count}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{meta.label}</div>
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {error ? null : !items ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent>
            <Empty className="py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"><CheckCircle2 /></EmptyMedia>
                <EmptyTitle>All clear</EmptyTitle>
                <EmptyDescription>No items need attention right now. Nicely done.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const meta = KIND_META[item.kind];
            const Icon = meta.icon;
            return (
              <Card key={item.id} onClick={() => openItem(item)} className="cursor-pointer transition-colors hover:border-primary/30 hover:bg-accent/50">
                <CardContent className="flex items-center gap-4 px-4">
                  <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${meta.tone}`}>
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.title}</p>
                    <p className="truncate text-sm text-muted-foreground">{item.detail}</p>
                  </div>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">{relativeTime(item.createdAt)}</span>
                  <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setDismissing(item); }}>Resolve</Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8" aria-label="Triage item actions" onClick={(e) => e.stopPropagation()}><MoreHorizontal className="size-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); snooze(item, 24, 'Snoozed for 24 hours'); }}>Snooze 24h</DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); snooze(item, 168, 'Snoozed for 7 days'); }}>Snooze 7 days</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={(e) => { e.stopPropagation(); setDismissing(item); }}>Dismiss</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!dismissing} onOpenChange={(o) => !o && setDismissing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dismiss this item?</AlertDialogTitle>
            <AlertDialogDescription>
              "{dismissing?.title}" will be removed from the queue without resolving the underlying issue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => { if (dismissing) dismiss(dismissing); setDismissing(null); }}
            >
              Dismiss
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
