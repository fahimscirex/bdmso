import { api } from '@/lib/api';
import { useList } from '@/hooks/use-list';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ListError } from '@/components/list-error';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function SystemHealthPage() {
  const { data: rows, error, reload } = useList(api.listServices);

  const allOk = (rows ?? []).every((s) => s.status === 'ok');

  return (
    <>
      <PageHeader title="System Health" description="Live status of every service the platform depends on." />

      {error && <ListError message={error} onRetry={reload} />}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className={cn('size-2.5 rounded-full', allOk ? 'bg-emerald-500' : 'bg-amber-500')} />
            {rows ? (allOk ? 'All systems operational' : 'Degraded performance') : 'Checking...'}
          </CardTitle>
          <CardDescription>Environment: production · region: APAC</CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {!rows ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />) : rows.map((s) => (
          <Card key={s.name}>
            <CardContent className="flex items-start gap-3 px-5">
              <span className={cn('mt-1 size-2.5 shrink-0 rounded-full',
                s.status === 'ok' ? 'bg-emerald-500' : s.status === 'degraded' ? 'bg-amber-500' : 'bg-red-500')} />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{s.name}</span>
                  <StatusBadge status={s.status} className="ml-auto" />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{s.hint}</p>
                <p className="mt-1 text-xs text-muted-foreground">Last activity {relativeTime(s.lastActivity)}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
