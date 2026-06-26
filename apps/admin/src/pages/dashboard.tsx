import { useState } from 'react';
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, XAxis,
  ResponsiveContainer, Area as Spark,
} from 'recharts';
import {
  ArrowDownRight, ArrowUpRight, CircleDollarSign,
  ClipboardList, Clock, Download, Wallet,
} from 'lucide-react';
import { api } from '@/lib/api';
import { bdt, dateUK, num, relativeTime } from '@/lib/format';
import { exportCsv } from '@/lib/export-csv';
import { useList } from '@/hooks/use-list';
import { Link, useRouter } from '@/router';
import { cn } from '@/lib/utils';
import { ListError } from '@/components/list-error';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from '@/components/ui/chart';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

// Per-tile identity: each KPI gets a distinct accent so the four read as
// separate metrics, while staying within the emerald-led brand. `chip` styles
// the icon badge, `tint` is the card's subtle background wash, `spark` colours
// the sparkline.
const KPI_META = [
  { icon: ClipboardList, chip: 'bg-primary/10 text-primary ring-primary/20', tint: 'from-primary/[0.07]', spark: 'var(--primary)' },
  { icon: Clock, chip: 'bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-400', tint: 'from-amber-500/[0.07]', spark: '#f59e0b' },
  { icon: CircleDollarSign, chip: 'bg-sky-500/10 text-sky-600 ring-sky-500/20 dark:text-sky-400', tint: 'from-sky-500/[0.07]', spark: '#0ea5e9' },
  { icon: Wallet, chip: 'bg-violet-500/10 text-violet-600 ring-violet-500/20 dark:text-violet-400', tint: 'from-violet-500/[0.07]', spark: '#8b5cf6' },
];

const trendConfig = {
  confirmed: { label: 'Confirmed', color: 'var(--chart-2)' },
  pending: { label: 'Pending', color: 'var(--chart-4)' },
} satisfies ChartConfig;

const payConfig = {
  count: { label: 'Registrations' },
  paid: { label: 'Paid', color: 'var(--chart-2)' },
  pending: { label: 'Pending', color: 'var(--chart-4)' },
  failed: { label: 'Failed', color: 'var(--destructive)' },
} satisfies ChartConfig;

export function DashboardPage() {
  const { navigate } = useRouter();
  const { data, error, reload } = useList(api.getDashboard);
  const { data: services } = useList(api.listServices);
  const [range, setRange] = useState('14');

  if (error) return <ListError message={error} onRetry={reload} />;

  const trend = data ? data.registrationsTrend.slice(-Number(range)) : [];
  const totals = data
    ? {
        paid: data.byProgram.reduce((s, p) => s + p.paid, 0),
        count: data.byProgram.reduce((s, p) => s + p.count, 0),
      }
    : null;

  const onExport = () => {
    if (!data) return;
    exportCsv('dashboard-by-program.csv', data.byProgram, [
      { header: 'Program', value: (p) => p.program },
      { header: 'Registrations', value: (p) => p.count },
      { header: 'Paid', value: (p) => p.paid },
      { header: 'Revenue (BDT)', value: (p) => p.revenue },
      { header: 'Conversion %', value: (p) => (p.count ? Math.round((p.paid / p.count) * 100) : 0) },
    ]);
  };

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Operations at a glance - what needs attention, then how the season is tracking."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={onExport} disabled={!data}><Download className="size-4" /> Export</Button>
            <Button size="sm" asChild><Link href="/registrations">View registrations</Link></Button>
          </>
        }
      />


      {/* KPI tiles - accent chip + metric + delta + full-bleed sparkline */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {!data
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[118px] rounded-xl" />)
          : data.kpis.map((kpi, i) => {
              const meta = KPI_META[i];
              const Icon = meta.icon;
              const up = kpi.delta >= 0;
              const flat = kpi.delta === 0;
              return (
                <Card key={kpi.label} className={cn('gap-0 overflow-hidden bg-gradient-to-t to-card py-0', meta.tint)}>
                  <div className="px-4 pt-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn('flex size-8 items-center justify-center rounded-lg ring-1 ring-inset', meta.chip)}>
                        <Icon className="size-4" />
                      </span>
                      <Badge className={cn(
                        'gap-0.5 rounded-full border-transparent px-2 py-0.5 text-[11px] font-semibold tabular-nums',
                        flat
                          ? 'bg-muted text-muted-foreground'
                          : up
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                            : 'bg-red-500/15 text-red-700 dark:text-red-400',
                      )}>
                        {!flat && (up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />)}
                        {up && !flat ? '+' : ''}{kpi.delta}%
                      </Badge>
                    </div>
                    <p className="mt-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{kpi.label}</p>
                    <div className="mt-0.5 flex items-baseline gap-2">
                      <span className="text-2xl font-bold tracking-tight tabular-nums">{kpi.value}</span>
                      {i === 0 && totals && (
                        <span className="text-xs font-medium tabular-nums text-muted-foreground">
                          <span className="text-emerald-700 dark:text-emerald-400">{num(totals.paid)}</span> paid
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 h-8 w-full" aria-hidden="true">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={kpi.spark.map((v) => ({ v }))} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}>
                        <defs>
                          <linearGradient id={`sp${i}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={meta.spark} stopOpacity={0.3} />
                            <stop offset="100%" stopColor={meta.spark} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Spark dataKey="v" type="monotone" strokeWidth={2} stroke={meta.spark} fill={`url(#sp${i})`} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              );
            })}
      </div>

      {/* Registrations by program - bordered header, gradient bars, hover rows */}
      <Card className="gap-0 py-0">
        <CardHeader className="flex! flex-row items-center justify-between rounded-t-xl border-b bg-muted/40 py-3 pb-3!">
          <CardTitle className="text-base">Registrations by program</CardTitle>
          {totals && (
            <CardAction className="flex items-center gap-2 self-center text-sm tabular-nums">
              <span>
                <span className="font-semibold text-foreground">{num(totals.paid)}</span>
                <span className="text-muted-foreground"> / {num(totals.count)} paid</span>
              </span>
              <span className="h-4 w-px bg-border" />
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                {totals.count ? Math.round((totals.paid / totals.count) * 100) : 0}% <span className="font-normal text-muted-foreground">converted</span>
              </span>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-b-xl bg-border sm:grid-cols-2 lg:grid-cols-3">
            {!data
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-card p-4">
                    <Skeleton className="h-10" />
                  </div>
                ))
              : data.byProgram.slice(0, 6).map((p) => {
                  const pct = p.count ? Math.round((p.paid / p.count) * 100) : 0;
                  const openRegs = () => navigate(`/registrations?program=${encodeURIComponent(p.programLabel)}`);
                  return (
                    <div
                      key={p.cohort}
                      role="button"
                      tabIndex={0}
                      onClick={openRegs}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRegs(); } }}
                      aria-label={`View ${p.program} registrations`}
                      className="cursor-pointer space-y-2 bg-card p-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{p.program.replace('BdMSO ', '')}</div>
                          <div className="text-xs tabular-nums text-muted-foreground">{bdt(p.revenue)} collected</div>
                        </div>
                        <span className="shrink-0 text-right tabular-nums">
                          <span className="block text-sm">
                            <span className="font-semibold text-foreground">{num(p.paid)}</span>
                            <span className="text-muted-foreground">/{num(p.count)} paid</span>
                          </span>
                          <span className="block text-xs font-semibold text-emerald-700 dark:text-emerald-400">{pct}% converted</span>
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary transition-[width] duration-500 ease-out"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
          </div>
        </CardContent>
      </Card>

      {/* Trend + payment breakdown */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle>Registrations trend</CardTitle>
            <CardDescription>Confirmed vs pending, last {range} days</CardDescription>
            <CardAction>
              <ToggleGroup type="single" value={range} onValueChange={(v) => v && setRange(v)} variant="outline" size="sm">
                <ToggleGroupItem value="7">7d</ToggleGroupItem>
                <ToggleGroupItem value="14">14d</ToggleGroupItem>
              </ToggleGroup>
            </CardAction>
          </CardHeader>
          <CardContent>
            {!data ? <Skeleton className="h-[240px] w-full" /> : (
              <div
                role="img"
                aria-label={`Registrations over the last ${trend.length} days: ${trend.reduce((s, d) => s + d.confirmed, 0)} confirmed and ${trend.reduce((s, d) => s + d.pending, 0)} pending in total.`}
              >
              <ChartContainer config={trendConfig} className="h-[240px] w-full">
                <AreaChart data={trend} margin={{ left: 4, right: 4, top: 8 }}>
                  <defs>
                    <linearGradient id="fillConfirmed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-confirmed)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="var(--color-confirmed)" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="fillPending" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-pending)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="var(--color-pending)" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24}
                    tickFormatter={(d) => dateUK(d).slice(0, 6)} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" labelFormatter={(l) => dateUK(l)} />} />
                  <Area dataKey="pending" type="natural" stackId="a" stroke="var(--color-pending)" fill="url(#fillPending)" strokeWidth={2} />
                  <Area dataKey="confirmed" type="natural" stackId="a" stroke="var(--color-confirmed)" fill="url(#fillConfirmed)" strokeWidth={2} />
                </AreaChart>
              </ChartContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Payment status</CardTitle>
            <CardDescription>This season's registrations</CardDescription>
          </CardHeader>
          <CardContent>
            {!data ? <Skeleton className="mx-auto size-[180px] rounded-full" /> : (
              <ChartContainer
                config={payConfig}
                className="mx-auto aspect-square max-h-[200px]"
                role="img"
                aria-label={`Payment status breakdown: ${data.paymentBreakdown.map((e) => `${e.count} ${e.status}`).join(', ')}.`}
              >
                <PieChart>
                  <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                  <Pie data={data.paymentBreakdown} dataKey="count" nameKey="status" innerRadius={52} strokeWidth={3}>
                    {data.paymentBreakdown.map((e) => <Cell key={e.status} fill={e.fill} />)}
                  </Pie>
                </PieChart>
              </ChartContainer>
            )}
            {data && (
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                {data.paymentBreakdown.map((e) => (
                  <div key={e.status} className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-[3px]" style={{ background: e.fill }} />
                    <span className="capitalize text-muted-foreground">{e.status}</span>
                    <span className="ml-auto font-medium tabular-nums">{e.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Triage preview */}
      <div className="grid gap-4">
        <Card className="flex min-w-0 flex-col">
          <CardHeader>
            <CardTitle>Triage queue</CardTitle>
            <CardDescription>Top items needing action</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                <Link href="/triage">View all</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="flex-1">
            <ScrollArea className="h-[230px] pr-3">
              <div className="space-y-3">
                {!data ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />) : data.triage.map((t) => (
                  <div key={t.id} className="flex items-start gap-2.5">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">{t.title}</p>
                        <span className="ml-auto shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t.urgency}</span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{t.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Activity + system health */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Latest admin and system actions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {!data ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />) : data.activity.map((a) => (
                <div key={a.id} className="flex items-center gap-3 text-sm">
                  <Avatar className="size-7">
                    <AvatarFallback className="text-[10px]">
                      {a.actor === 'system' ? 'SY' : a.actor.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <p className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{a.actor === 'system' ? 'System' : a.actor}</span>{' '}
                    <span className="text-muted-foreground">{a.action}</span>{' '}
                    <span className="font-medium">{a.target}</span>
                  </p>
                  <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(a.at)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>System health</CardTitle>
            <CardDescription>Service status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!services
              ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)
              : services.map((s, i, arr) => (
                  <div key={s.name}>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm">
                        <span className={cn('size-2 rounded-full', s.status === 'ok' ? 'bg-emerald-500' : s.status === 'down' ? 'bg-red-500' : 'bg-amber-500')} />
                        {s.name}
                      </span>
                      <StatusBadge status={s.status} />
                    </div>
                    {i < arr.length - 1 && <Separator className="mt-3" />}
                  </div>
                ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
