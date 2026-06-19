import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts';
import { Download, TrendingUp, Users, Wallet } from 'lucide-react';
import { api, type ReportRow } from '@/lib/api';
import { bdt, compactBdt, num } from '@/lib/format';
import { exportCsv } from '@/lib/export-csv';
import { useList } from '@/hooks/use-list';
import { ListError } from '@/components/list-error';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
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
  const { data, error, reload } = useList(api.getReports);
  const [metric, setMetric] = useState<'participants' | 'revenue'>('participants');

  if (error) return <ListError message={error} onRetry={reload} />;

  const totals = (data?.region ?? []).reduce(
    (a, r) => ({ total: a.total + r.total, paid: a.paid + r.paid, revenue: a.revenue + r.revenue }),
    { total: 0, paid: 0, revenue: 0 },
  );

  return (
    <>
      <PageHeader
        title="Reports"
        description="Participation and revenue, broken down by program and by region."
        actions={
          <ToggleGroup type="single" value={metric} onValueChange={(v) => v && setMetric(v as typeof metric)} variant="outline" size="sm">
            <ToggleGroupItem value="participants"><Users className="size-3.5" /> Participants</ToggleGroupItem>
            <ToggleGroupItem value="revenue"><Wallet className="size-3.5" /> Revenue</ToggleGroupItem>
          </ToggleGroup>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {!data ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[88px] rounded-xl" />) : (
          <>
            <Kpi icon={Users} label="Total participants" value={num(totals.total)} />
            <Kpi icon={TrendingUp} label="Paid" value={num(totals.paid)} />
            <Kpi icon={Wallet} label="Revenue" value={bdt(totals.revenue)} />
            <Kpi icon={TrendingUp} label="Conversion" value={`${totals.total ? Math.round((totals.paid / totals.total) * 100) : 0}%`} />
          </>
        )}
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
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>{metric === 'revenue' ? 'Revenue' : 'Participants'} by {unit}</CardTitle>
          <CardDescription>{metric === 'revenue' ? 'Paid revenue per ' : 'Total vs paid per '}{unit}</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[320px] w-full">
            <BarChart accessibilityLayer data={sorted} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v) => (metric === 'revenue' ? compactBdt(v) : num(v))} />
              <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={110} tick={{ fontSize: 12 }} />
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
            <TableRow className="hover:bg-transparent">
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
