import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Bold, Heading2, Italic, Link as LinkIcon, List, Send, Users } from 'lucide-react';
import type { BroadcastRun, EmailTemplate, Program } from '@/lib/types';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { run } from '@/lib/run';
import { renderMarkdown } from '@/lib/markdown';
import { dateTimeUK, num } from '@/lib/format';
import { PageHeader } from '@/components/page-header';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AttachmentField, type Attachment } from '@/components/attachment-field';

export function BroadcastPage() {
  const [program, setProgram] = useState('all');
  const [region, setRegion] = useState('all');
  const [status, setStatus] = useState('all');
  const [tab, setTab] = useState('compose');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [emails, setEmails] = useState('');
  const [recipients, setRecipients] = useState<number | null>(null);

  // Manually-entered addresses override the audience filters.
  const manualEmails = useMemo(
    () => [...new Set(emails.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))],
    [emails],
  );
  const [programs, setPrograms] = useState<Program[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [history, setHistory] = useState<BroadcastRun[] | null>(null);

  useEffect(() => {
    api.listPrograms().then(setPrograms).catch(() => {});
    api.listEmailTemplates().then(setTemplates).catch(() => {});
    api.listBroadcasts().then(setHistory).catch(() => setHistory([]));
    api.listRegions().then(setRegions).catch(() => {});
  }, []);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (program !== 'all') p.set('program', program);
    if (region !== 'all') p.set('venue', region);
    if (status !== 'all') p.set('status', status);
    const s = p.toString();
    return s ? `?${s}` : '';
  }, [program, region, status]);

  useEffect(() => {
    let active = true;
    // Manual list: the recipient count is just the addresses entered.
    if (manualEmails.length) { setRecipients(manualEmails.length); return; }
    setRecipients(null);
    api.broadcastRecipients(qs).then((d) => { if (active) setRecipients(d.count); }).catch(() => { if (active) setRecipients(0); });
    return () => { active = false; };
  }, [qs, manualEmails]);

  const send = async () => {
    try {
      const res = await api.broadcastSend(
        manualEmails.length
          ? { subject, message: renderMarkdown(body), emails: manualEmails, attachments }
          : {
              subject,
              message: renderMarkdown(body),
              program: program === 'all' ? undefined : program,
              venue: region === 'all' ? undefined : region,
              status: status === 'all' ? undefined : status,
              attachments,
            },
      );
      toast.success(
        res.failed > 0
          ? `Sent to ${res.sent}, ${res.failed} failed`
          : `Broadcast sent to ${res.sent} recipients`,
      );
      api.listBroadcasts().then(setHistory).catch(() => {});
    } catch (e) {
      toast.error('Action failed', { description: (e as Error).message });
    }
  };

  return (
    <>
      <Tabs value={tab} onValueChange={setTab} className="gap-6">
        <PageHeader
          title="Broadcast"
          description="Email guardians, filtered by program, region, and payment status."
          actions={
            <TabsList>
              <TabsTrigger value="compose">Compose</TabsTrigger>
              <TabsTrigger value="templates">Templates</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
          }
        />

        <TabsContent value="compose" className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Message</CardTitle><CardDescription>Sent as a transactional email via Brevo.</CardDescription></CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2"><Label htmlFor="subject">Subject</Label><Input id="subject" value={subject} onChange={(e) => setSubject(e.currentTarget.value)} placeholder="Payment reminder - National Olympiad" /></div>
              <div className="grid gap-2"><Label>Body</Label><MarkdownField value={body} onChange={setBody} /></div>
              <div className="grid gap-2"><Label>Attachments</Label><AttachmentField value={attachments} onChange={setAttachments} /></div>
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader><CardTitle>Audience</CardTitle><CardDescription>Who receives this</CardDescription></CardHeader>
            <CardContent className="grid gap-3">
              <div className={manualEmails.length ? 'grid gap-3 opacity-50' : 'grid gap-3'}>
                <Field label="Program">
                  <Select value={program} onValueChange={setProgram} disabled={manualEmails.length > 0}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All programs</SelectItem>
                      {programs.map((p) => <SelectItem key={p.slug} value={p.slug}>{p.title.replace('BdMSO ', '')}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Exam region">
                  <Select value={region} onValueChange={setRegion} disabled={manualEmails.length > 0}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All exam regions</SelectItem>
                      {regions.map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Payment status">
                  <Select value={status} onValueChange={setStatus} disabled={manualEmails.length > 0}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Everyone</SelectItem>
                      <SelectItem value="paid">Paid only</SelectItem>
                      <SelectItem value="unpaid">Unpaid / not enrolled</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Specific emails (optional)">
                <Textarea
                  value={emails}
                  onChange={(e) => setEmails(e.currentTarget.value)}
                  placeholder="name@example.com, another@example.com"
                  rows={3}
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground">Comma or newline separated. When set, this overrides the filters above.</p>
              </Field>
              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
                <Users className="size-4 text-muted-foreground" />
                <span>{recipients == null ? 'Counting...' : <><span className="font-semibold tabular-nums">{num(recipients)}</span> recipients{manualEmails.length ? ' (manual)' : ''}</>}</span>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild><Button className="w-full" disabled={!subject || !body}><Send className="size-4" /> Send broadcast</Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Send to {num(recipients ?? 0)} guardians?</AlertDialogTitle>
                    <AlertDialogDescription>This sends immediately and cannot be recalled.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={send}>Send now</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates">
          <Card className="overflow-hidden py-0">
            <Table>
              <TableHeader><TableRow className="hover:bg-transparent"><TableHead>Template</TableHead><TableHead className="hidden sm:table-cell">Subject</TableHead><TableHead>Category</TableHead><TableHead className="w-20" /></TableRow></TableHeader>
              <TableBody>
                {templates.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">{t.subject}</TableCell>
                    <TableCell><span className="text-muted-foreground">{t.category}</span></TableCell>
                    <TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => { setSubject(t.subject); setBody(t.body); setTab('compose'); run(Promise.resolve(), `Loaded "${t.name}"`); }}>Use</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card className="overflow-hidden py-0">
            <Table>
              <TableHeader><TableRow className="hover:bg-transparent"><TableHead>Subject</TableHead><TableHead className="hidden sm:table-cell">Audience</TableHead><TableHead className="text-right">Recipients</TableHead><TableHead className="text-right">Delivered</TableHead><TableHead className="hidden lg:table-cell">Sent</TableHead></TableRow></TableHeader>
              <TableBody>
                {!history ? Array.from({ length: 3 }).map((_, i) => <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-6 w-full" /></TableCell></TableRow>) : history.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.subject}</TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">{b.audience}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(b.recipients)}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.recipients ? Math.round((b.opened / b.recipients) * 100) : 0}%</TableCell>
                    <TableCell className="hidden lg:table-cell whitespace-nowrap text-muted-foreground">{dateTimeUK(b.sentAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="grid gap-1.5"><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>;
}

// Markdown composer: a small formatting toolbar + Write/Preview tabs. The body
// is plain markdown; renderMarkdown turns it into the HTML that gets emailed.
function MarkdownField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const wrap = (before: string, after: string, placeholder: string) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const sel = value.slice(s, e) || placeholder;
    onChange(value.slice(0, s) + before + sel + after + value.slice(e));
    requestAnimationFrame(() => { el.focus(); el.selectionStart = s + before.length; el.selectionEnd = s + before.length + sel.length; });
  };
  const prefixLine = (prefix: string) => {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart;
    const lineStart = value.lastIndexOf('\n', s - 1) + 1;
    onChange(value.slice(0, lineStart) + prefix + value.slice(lineStart));
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = s + prefix.length; });
  };

  return (
    <Tabs defaultValue="write" className="gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-0.5">
          <Button type="button" variant="ghost" size="icon" className="size-7" title="Bold" onClick={() => wrap('**', '**', 'bold text')}><Bold className="size-3.5" /></Button>
          <Button type="button" variant="ghost" size="icon" className="size-7" title="Italic" onClick={() => wrap('*', '*', 'italic text')}><Italic className="size-3.5" /></Button>
          <Button type="button" variant="ghost" size="icon" className="size-7" title="Heading" onClick={() => prefixLine('## ')}><Heading2 className="size-3.5" /></Button>
          <Button type="button" variant="ghost" size="icon" className="size-7" title="Bullet list" onClick={() => prefixLine('- ')}><List className="size-3.5" /></Button>
          <Button type="button" variant="ghost" size="icon" className="size-7" title="Link" onClick={() => wrap('[', '](https://)', 'link text')}><LinkIcon className="size-3.5" /></Button>
        </div>
        <TabsList>
          <TabsTrigger value="write">Write</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="write">
        <Textarea
          ref={ref}
          rows={18}
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          placeholder="Dear guardian, ...&#10;&#10;Use **bold**, *italic*, ## headings, - lists, and [links](https://bdmso.org)."
          className="font-mono text-sm"
        />
      </TabsContent>
      <TabsContent value="preview">
        <div
          className="min-h-[238px] max-w-none rounded-md border p-4 text-sm [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h2]:mb-1 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_h4]:font-semibold [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(value) || '<p class="text-muted-foreground">Nothing to preview yet.</p>' }}
        />
      </TabsContent>
    </Tabs>
  );
}
