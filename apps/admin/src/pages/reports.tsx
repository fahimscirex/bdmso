import { useState, useEffect, useCallback } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts';
import { Download, Megaphone, Share2, TrendingUp, Users, Wallet } from 'lucide-react';
import { api, type ReportRow } from '@/lib/api';
import { bdt, compactBdt, num } from '@/lib/format';
import { exportCsv } from '@/lib/export-csv';
import { useList } from '@/hooks/use-list';
import { ListError } from '@/components/list-error';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const chartConfig = {
  total: { label: 'Total', color: 'var(--chart-3)' },
  paid: { label: 'Paid', color: 'var(--chart-2)' },
  revenue: { label: 'Revenue', color: 'var(--chart-2)' },
} satisfies ChartConfig;

export function ReportsPage() {
  const [metric, setMetric] = useState<'participants' | 'revenue'>('participants');
  const [cohort, setCohort] = useState('all'); // 'all' = everything (lifetime)
  const { data: cohorts } = useList(api.listCohorts);
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getReports>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setData(null);
    setError(null);
    return api.getReports(cohort === 'all' ? undefined : cohort)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [cohort]);
  useEffect(() => { load(); }, [load]);

  if (error) return <ListError message={error} onRetry={load} />;

  const totals = data?.totals ?? { participants: 0, paid: 0, revenue: 0, adPaid: 0, adPaidPaid: 0, fbOrganic: 0, fbOrganicPaid: 0 };
  // Newest runs first; each labelled with its start date so repeat programs are
  // distinguishable (e.g. two mock tests).
  const cohortOpts = [...(cohorts ?? [])].sort((a, b) => (b.startsOn ?? '').localeCompare(a.startsOn ?? ''));

  return (
    <>
      <PageHeader
        title="Reports"
        description="Participation and revenue. Defaults to everything; pick a single run to scope it."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={cohort} onValueChange={setCohort}>
              <SelectTrigger size="sm" className="w-[230px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everything (all time)</SelectItem>
                {cohortOpts.map((c) => (
                  <SelectItem key={c.cohortKey} value={c.cohortKey}>
                    {c.label}{c.startsOn ? ` · ${c.startsOn}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ToggleGroup type="single" value={metric} onValueChange={(v) => v && setMetric(v as typeof metric)} variant="outline" size="sm">
              <ToggleGroupItem value="participants"><Users className="size-3.5" /> Participants</ToggleGroupItem>
              <ToggleGroupItem value="revenue"><Wallet className="size-3.5" /> Revenue</ToggleGroupItem>
            </ToggleGroup>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {!data ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[88px] rounded-xl" />) : (
          <>
            <Kpi icon={Users} label="Total participants" value={num(totals.participants)} />
            <Kpi icon={TrendingUp} label="Paid" value={num(totals.paid)} />
            <Kpi icon={Wallet} label="Revenue" value={bdt(totals.revenue)} />
            <Kpi icon={TrendingUp} label="Conversion" value={`${totals.participants ? Math.round((totals.paid / totals.participants) * 100) : 0}%`} />
          </>
        )}
      </div>

      {/* Acquisition: where registrations came from (first-party fbclid / utm) */}
      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Acquisition source</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {!data ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-[88px] rounded-xl" />) : (
            <>
              <Kpi icon={Megaphone} label={`Paid ads · ${num(totals.adPaidPaid)} paid`} value={num(totals.adPaid)} />
              <Kpi icon={Share2} label={`FB/IG organic · ${num(totals.fbOrganicPaid)} paid`} value={num(totals.fbOrganic)} />
            </>
          )}
        </div>
      </div>

      <Tabs defaultValue="program">
        <TabsList>
          <TabsTrigger value="program">By program</TabsTrigger>
          <TabsTrigger value="region">By region</TabsTrigger>
        </TabsList>
        <TabsContent value="program"><Breakdown title="Programs" rows={data?.program ?? null} metric={metric} file="report-by-program.csv" /></TabsContent>
        <TabsContent value="region"><Breakdown title="Regions" rows={data?.region ?? null} metric={metric} file="report-by-region.csv" /></TabsContent>
      </Tabs>
    </>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 px-5">
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-5" /></span>
        <div>
          <div className="text-2xl font-semibold tabular-nums">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Breakdown({ title, rows, metric, file }: { title: string; rows: ReportRow[] | null; metric: 'participants' | 'revenue'; file: string }) {
  if (!rows) return <Skeleton className="h-[360px] w-full rounded-xl" />;
  const sorted = [...rows].sort((a, b) => (metric === 'revenue' ? b.revenue - a.revenue : b.total - a.total));
  const maxRev = Math.max(1, ...sorted.map((r) => r.revenue));
  const unit = title.toLowerCase().slice(0, -1);

  const onExport = () =>
    exportCsv(file, sorted, [
      { header: title.slice(0, -1), value: (r) => r.name },
      { header: 'Participants', value: (r) => r.total },
      { header: 'Paid', value: (r) => r.paid },
      { header: 'Revenue (BDT)', value: (r) => r.revenue },
      { header: 'Conversion %', value: (r) => (r.total ? Math.round((r.paid / r.total) * 100) : 0) },
    ]);

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="min-w-0 lg:col-span-3">
        <CardHeader>
          <CardTitle>{metric === 'revenue' ? 'Revenue' : 'Participants'} by {unit}</CardTitle>
          <CardDescription>{metric === 'revenue' ? 'Paid revenue per ' : 'Total vs paid per '}{unit}</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[320px] w-full">
            <BarChart accessibilityLayer data={sorted} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v) => (metric === 'revenue' ? compactBdt(v) : num(v))} />
              <YAxis
                type="category" dataKey="name" tickLine={false} axisLine={false} width={150} interval={0}
                tick={(props) => {
                  const { x, y, payload } = props as { x: number; y: number; payload: { value: string } };
                  const v = payload.value;
                  return (
                    <text x={x} y={y} dy={4} textAnchor="end" fontSize={11} className="fill-muted-foreground">
                      {v.length > 22 ? v.slice(0, 21) + '…' : v}
                    </text>
                  );
                }}
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              {metric === 'revenue' ? (
                <Bar dataKey="revenue" radius={4}>
                  {sorted.map((r) => <Cell key={r.name} fill="var(--color-revenue)" fillOpacity={0.4 + 0.6 * (r.revenue / maxRev)} />)}
                </Bar>
              ) : (
                <>
                  <Bar dataKey="total" fill="var(--color-total)" radius={4} fillOpacity={0.35} />
                  <Bar dataKey="paid" fill="var(--color-paid)" radius={4} />
                </>
              )}
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2 overflow-hidden py-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-medium">{title}</span>
          <Button variant="outline" size="sm" className="h-8" onClick={onExport}><Download className="size-3.5" /> Export</Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-b bg-muted/50 hover:bg-muted/50">
              <TableHead>{title.slice(0, -1)}</TableHead>
              <TableHead className="text-right">Paid / Total</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">Conv.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r) => (
              <TableRow key={r.name}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-right tabular-nums">{num(r.paid)} <span className="text-muted-foreground">/ {num(r.total)}</span></TableCell>
                <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">{compactBdt(r.revenue)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{r.total ? Math.round((r.paid / r.total) * 100) : 0}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
