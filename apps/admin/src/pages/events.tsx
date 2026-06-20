import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import type { ExamEvent, RosterEntry, ExamSection, ImportResult } from '@/lib/types';
import { api } from '@/lib/api';
import { run } from '@/lib/run';
import { exportCsv } from '@/lib/export-csv';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

// Minimal CSV parse: first row = headers, comma-separated, quotes stripped.
function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return { headers: [], rows: [] };
  const split = (l: string) => l.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
  return { headers: split(lines[0]), rows: lines.slice(1).map(split) };
}

export function EventsPage() {
  const [events, setEvents] = useState<ExamEvent[] | null>(null);
  const [eventKey, setEventKey] = useState<string>('');
  const [sections, setSections] = useState<ExamSection[]>([]);
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);

  const reloadEvents = () => api.listExamEvents().then((evs) => {
    setEvents(evs);
    // Default to the event that actually has scores (so the page doesn't open
    // on an empty event); fall back to the first.
    setEventKey((k) => k || [...evs].sort((a, b) => b.scored - a.scored)[0]?.eventKey || '');
  });
  useEffect(() => { reloadEvents(); }, []);

  const loadRoster = (key: string) => {
    setRoster(null);
    api.getRoster(key).then((r) => { setSections(r.sections); setRoster(r.rows); });
  };
  useEffect(() => { if (eventKey) loadRoster(eventKey); }, [eventKey]);

  const event = useMemo(() => events?.find((e) => e.eventKey === eventKey), [events, eventKey]);

  const togglePublish = (next: boolean) =>
    run(api.publishResults(eventKey, next), next ? 'Results published to guardians' : 'Results hidden from guardians', reloadEvents);

  return (
    <>
      <PageHeader
        title="Events &amp; results"
        description="Roster check-in, score entry, and releasing results to guardians."
        actions={
          <Select value={eventKey} onValueChange={setEventKey}>
            <SelectTrigger size="sm" className="w-[240px]"><SelectValue placeholder="Select event" /></SelectTrigger>
            <SelectContent>{(events ?? []).map((e) => <SelectItem key={e.eventKey} value={e.eventKey}>{e.label}</SelectItem>)}</SelectContent>
          </Select>
        }
      />

      {event && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Scored</span>
              <span className="font-semibold tabular-nums">{event.scored}</span>
              <span className="text-muted-foreground">of {roster?.length ?? '—'} participants</span>
            </div>
            <div className="ml-auto flex items-center gap-3">
              {event.resultsPublished
                ? <Badge className="gap-1 border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-3.5" /> Published</Badge>
                : <Badge variant="outline" className="text-muted-foreground">Draft - hidden from guardians</Badge>}
              <Label htmlFor="publish" className="text-sm">Release results</Label>
              <Switch id="publish" checked={event.resultsPublished} onCheckedChange={togglePublish} />
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="scores" className="gap-4">
        <TabsList>
          <TabsTrigger value="scores">Score entry</TabsTrigger>
          <TabsTrigger value="import">Import CSV</TabsTrigger>
          <TabsTrigger value="roster">Roster &amp; check-in</TabsTrigger>
        </TabsList>

        <TabsContent value="scores">
          <ScoresTab eventKey={eventKey} sections={sections} roster={roster} onChanged={() => { loadRoster(eventKey); reloadEvents(); }} />
        </TabsContent>
        <TabsContent value="import">
          <ImportTab eventKey={eventKey} sections={sections} roster={roster} onCommitted={() => { loadRoster(eventKey); reloadEvents(); }} />
        </TabsContent>
        <TabsContent value="roster">
          <RosterTab eventKey={eventKey} roster={roster} onChanged={() => loadRoster(eventKey)} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function ScoresTab({ eventKey, sections, roster, onChanged }: {
  eventKey: string; sections: ExamSection[]; roster: RosterEntry[] | null; onChanged: () => void;
}) {
  const [tierTop, setTierTop] = useState('10');

  const save = (regId: string, section: ExamSection, raw: string) => {
    if (raw === '') return;
    const score = Number(raw);
    if (!Number.isFinite(score) || score < 0 || score > section.max) { toast.error(`Score must be 0-${section.max}`); return; }
    run(api.saveScore(eventKey, { registration_id: regId, section: section.id, score, max_score: section.max }), 'Score saved');
  };

  return (
    <Card className="overflow-hidden gap-0 py-0">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <span className="text-sm text-muted-foreground">After entering scores, finalize each section to compute ranks. Top</span>
        <Input value={tierTop} onChange={(e) => setTierTop(e.target.value)} className="h-7 w-16 text-center tabular-nums" />
        <span className="text-sm text-muted-foreground">get a medal tier.</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {sections.map((s) => (
            <Button key={s.id} variant="outline" size="sm"
              onClick={() => run(api.finalizeSection(eventKey, s.id, Number(tierTop) || 0), `Ranked ${s.label}`, onChanged)}>
              Finalize {s.label}
            </Button>
          ))}
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Participant</TableHead>
            {sections.map((s) => <TableHead key={s.id} className="text-right">{s.label} <span className="text-muted-foreground">/{s.max}</span></TableHead>)}
            <TableHead className="text-right">Rank</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!roster ? Array.from({ length: 6 }).map((_, i) => (
            <TableRow key={i}><TableCell colSpan={sections.length + 2}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
          )) : roster.length === 0 ? (
            <TableRow className="hover:bg-transparent"><TableCell colSpan={sections.length + 2} className="h-24 text-center text-muted-foreground">No paid participants for this event.</TableCell></TableRow>
          ) : roster.map((p) => {
            const ranks = sections.map((s) => p.scores[s.id]?.rank).filter((r) => r != null) as number[];
            const tier = sections.map((s) => p.scores[s.id]?.tier).find(Boolean);
            return (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="font-medium">{p.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">{p.memberId || p.id}</div>
                </TableCell>
                {sections.map((s) => (
                  <TableCell key={s.id} className="text-right">
                    <Input
                      type="number" min={0} max={s.max} defaultValue={p.scores[s.id]?.score ?? ''}
                      onBlur={(e) => save(p.id, s, e.target.value)}
                      className="ml-auto h-8 w-20 text-right font-mono tabular-nums" placeholder="—"
                    />
                  </TableCell>
                ))}
                <TableCell className="text-right">
                  {ranks.length ? (
                    <span className="inline-flex items-center gap-1.5 tabular-nums">
                      <span className="font-semibold">#{Math.min(...ranks)}</span>
                      {tier && <Badge className="border-transparent bg-amber-500/15 text-amber-700 capitalize dark:text-amber-400">{tier}</Badge>}
                    </span>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

function ImportTab({ eventKey, sections, roster, onCommitted }: { eventKey: string; sections: ExamSection[]; roster: RosterEntry[] | null; onCommitted: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);

  // Pre-filled template: every participant's BdMSO ID + name. One empty column
  // per section - or per part when the section has a breakdown. Staff fill the
  // scores and re-import this file.
  const downloadTemplate = () => {
    exportCsv(`results-template-${eventKey}.csv`, roster ?? [], [
      { header: 'BdMSO ID', value: (p) => p.memberId || p.id },
      { header: 'Name', value: (p) => p.name },
      ...sections.flatMap((s) => (s.parts?.length
        ? s.parts.map((p) => ({ header: p, value: () => '' }))
        : [{ header: s.label, value: () => '' }])),
    ]);
  };
  const [parsed, setParsed] = useState<{ member_id: string; scores: Record<string, string>; detail: Record<string, Record<string, number>> }[] | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  // Map a CSV header to its target: a flat section, or one part of a section.
  // Matched by section id/label, or part label, case-insensitive.
  const targetFor = (header: string): { section: string; part?: string } | undefined => {
    const h = header.trim().toLowerCase();
    for (const s of sections) {
      if (s.parts?.length) {
        const part = s.parts.find((p) => p.toLowerCase() === h);
        if (part) return { section: s.id, part };
      } else if (s.id.toLowerCase() === h || s.label.toLowerCase() === h) {
        return { section: s.id };
      }
    }
    return undefined;
  };

  const onFile = async (file: File) => {
    const { headers, rows } = parseCsv(await file.text());
    const idCol = headers.findIndex((h) => /member|bdmso|id/i.test(h));
    if (idCol < 0) { toast.error('No BdMSO ID column found (header must contain "ID").'); return; }
    const colMap = headers.map((h, i) => (i === idCol ? null : targetFor(h)));
    const recs = rows.map((cells) => {
      const scores: Record<string, string> = {};
      const detail: Record<string, Record<string, number>> = {};
      colMap.forEach((t, i) => {
        if (!t || cells[i] == null || cells[i] === '') return;
        if (t.part) (detail[t.section] ??= {})[t.part] = Number(cells[i]);
        else scores[t.section] = cells[i];
      });
      // A section built from parts: its score is the sum of those parts.
      for (const [sec, parts] of Object.entries(detail)) {
        scores[sec] = String(Object.values(parts).reduce((n, x) => n + (Number(x) || 0), 0));
      }
      return { member_id: cells[idCol] || '', scores, detail };
    }).filter((r) => r.member_id);
    setParsed(recs);
    setPreview(null);
    setBusy(true);
    try { setPreview(await api.importScores(eventKey, recs, false)); }
    catch (e) { toast.error('Preview failed', { description: (e as Error).message }); }
    finally { setBusy(false); }
  };

  const commit = async () => {
    if (!parsed) return;
    setBusy(true);
    await run(api.importScores(eventKey, parsed, true), 'Scores imported', () => { setParsed(null); setPreview(null); if (fileRef.current) fileRef.current.value = ''; onCommitted(); });
    setBusy(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Import scores from CSV</CardTitle>
        <CardDescription>
          One row per student, keyed by BdMSO ID. Columns: a <strong>BdMSO ID</strong> column plus one per section
          ({sections.flatMap((s) => (s.parts?.length ? s.parts : [s.label])).join(', ') || 'no sections defined'}). Blank cells are skipped.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={downloadTemplate} disabled={!roster?.length}>
            <Download className="size-3.5" /> Download template
          </Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Upload className="size-3.5" /> Choose CSV
          </Button>
          {parsed && <span className="text-sm text-muted-foreground">{parsed.length} rows parsed</span>}
        </div>

        {preview && (
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge className="border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">{preview.summary.matched} matched</Badge>
              {preview.summary.unmatched > 0 && <Badge className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400">{preview.summary.unmatched} unmatched</Badge>}
              {preview.summary.invalid > 0 && <Badge className="border-transparent bg-red-500/15 text-red-700 dark:text-red-400">{preview.summary.invalid} invalid</Badge>}
            </div>
            {(preview.unmatched.length > 0 || preview.invalid.length > 0) && (
              <div className="max-h-48 overflow-auto rounded-lg border text-sm">
                <Table>
                  <TableBody>
                    {preview.unmatched.map((u, i) => (
                      <TableRow key={`u${i}`}><TableCell className="font-mono text-xs">{u.member_id || '(blank)'}</TableCell><TableCell className="text-amber-700 dark:text-amber-400">unmatched: {u.reason}</TableCell></TableRow>
                    ))}
                    {preview.invalid.map((v, i) => (
                      <TableRow key={`v${i}`}><TableCell className="font-mono text-xs">{v.member_id}</TableCell><TableCell className="text-red-700 dark:text-red-400">{v.student ? `${v.student}: ` : ''}{v.reason}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <div>
              <Button size="sm" onClick={commit} disabled={busy || preview.summary.matched === 0}>
                Import {preview.summary.matched} score{preview.summary.matched === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RosterTab({ eventKey, roster, onChanged }: { eventKey: string; roster: RosterEntry[] | null; onChanged: () => void }) {
  const toggle = (p: RosterEntry) => {
    const next = p.attendanceStatus === 'present' ? 'absent' : 'present';
    run(api.eventCheckin(eventKey, p.id, next), next === 'present' ? `${p.name} checked in` : `${p.name} marked absent`, onChanged);
  };
  return (
    <Card className="overflow-hidden py-0">
      <Table>
        <TableHeader><TableRow className="hover:bg-transparent"><TableHead>Participant</TableHead><TableHead className="hidden sm:table-cell">Exam region</TableHead><TableHead className="text-right">Checked in</TableHead></TableRow></TableHeader>
        <TableBody>
          {!roster ? Array.from({ length: 6 }).map((_, i) => (
            <TableRow key={i}><TableCell colSpan={3}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
          )) : roster.length === 0 ? (
            <TableRow className="hover:bg-transparent"><TableCell colSpan={3} className="h-24 text-center text-muted-foreground">No paid participants for this event.</TableCell></TableRow>
          ) : roster.map((p) => {
            const inHall = p.attendanceStatus === 'present' || p.attendanceStatus === 'late';
            return (
              <TableRow key={p.id} data-state={inHall ? 'selected' : undefined}>
                <TableCell><div className="font-medium">{p.name}</div><div className="font-mono text-xs text-muted-foreground">{p.memberId || p.id}</div></TableCell>
                <TableCell className="hidden capitalize sm:table-cell text-muted-foreground">{p.venue}</TableCell>
                <TableCell className="text-right"><Switch checked={inHall} onCheckedChange={() => toggle(p)} className="ml-auto" /></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
