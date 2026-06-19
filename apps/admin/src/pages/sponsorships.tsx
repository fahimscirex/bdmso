import { useState } from 'react';
import { ChevronDown, Mail } from 'lucide-react';
import type { Sponsorship } from '@/lib/types';
import { api } from '@/lib/api';
import { useList } from '@/hooks/use-list';
import { run } from '@/lib/run';
import { bdt, relativeTime } from '@/lib/format';
import { ListError } from '@/components/list-error';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';

const STATUSES = ['new', 'contacted', 'closed'] as const;

export function SponsorshipsPage() {
  const { data: rows, error, reload, setData: setRows } = useList(api.listSponsorships);
  const [tab, setTab] = useState('all');
  const filtered = (rows ?? []).filter((s) => tab === 'all' || s.status === tab);

  const setStatus = (id: string, status: Sponsorship['status']) => {
    const prev = rows;
    setRows((cur) => (cur ?? []).map((s) => (s.id === id ? { ...s, status } : s)));
    run(api.sponsorshipStatus(id, status), `Marked as ${status}`, undefined, () => setRows(prev));
  };

  return (
    <>
      <PageHeader title="Sponsorships" description="Partnership enquiries from the contact form." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="new">New</TabsTrigger>
          <TabsTrigger value="contacted">Contacted</TabsTrigger>
          <TabsTrigger value="closed">Closed</TabsTrigger>
        </TabsList>
      </Tabs>

      {error ? (
        <ListError message={error} onRetry={reload} />
      ) : !rows ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent><Empty className="py-14"><EmptyHeader><EmptyMedia variant="icon"><Mail /></EmptyMedia><EmptyTitle>No enquiries</EmptyTitle><EmptyDescription>Nothing in this view.</EmptyDescription></EmptyHeader></Empty></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => (
            <Card key={s.id}>
              <CardContent className="space-y-2.5 px-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{s.company}</span>
                  <StatusBadge status={s.status} />
                  {s.amount != null && <span className="font-mono text-sm text-muted-foreground">{bdt(s.amount)}</span>}
                  <span className="ml-auto text-xs text-muted-foreground">{relativeTime(s.createdAt)}</span>
                </div>
                <p className="text-sm text-muted-foreground">{s.message}</p>
                <div className="flex items-center gap-2 pt-1">
                  <Button variant="outline" size="sm" asChild>
                    <a href={`mailto:${s.email}`}><Mail className="size-3.5" /> {s.contact}</a>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">Set status <ChevronDown className="size-3.5" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-36">
                      {STATUSES.map((st) => (
                        <DropdownMenuItem key={st} className="capitalize" onClick={() => setStatus(s.id, st)}>{st}</DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
