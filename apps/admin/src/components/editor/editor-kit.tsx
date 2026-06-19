import { useRef, useState, type ReactNode } from 'react';
import { Bold, CalendarIcon, Heading2, ImageIcon, Info, Italic, Link as LinkIcon, List, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { renderMarkdown } from '@/lib/markdown';
import { dateUK } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// Small info (i) tooltip describing a field.
function InfoHint({ hint, label }: { hint: string; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" tabIndex={-1} aria-label={`About ${label}`} className="text-muted-foreground/60 transition-colors hover:text-foreground">
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-pretty">{hint}</TooltipContent>
    </Tooltip>
  );
}

// Shared building blocks for the content editors: a full-size dialog shell with
// an optional side-by-side preview pane, colour-separated sections, and fields
// that carry an info tooltip describing what to enter.

// One field: label + an info icon (hover for guidance) + the control.
export function EditorField({
  label, hint, htmlFor, className, children,
}: { label: string; hint?: string; htmlFor?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn('grid gap-2', className)}>
      <div className="flex items-center gap-1.5">
        <Label htmlFor={htmlFor}>{label}</Label>
        {hint && <InfoHint hint={hint} label={label} />}
      </div>
      {children}
    </div>
  );
}

// Inline boolean field: label (+ info) on the left, Switch on the right, in a
// single bordered row. Use for toggles instead of stacking them in EditorField.
export function SwitchField({
  label, hint, checked, onChange, id,
}: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; id?: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
      <span className="flex items-center gap-1.5">
        <span className="text-sm font-medium">{label}</span>
        {hint && <InfoHint hint={hint} label={label} />}
      </span>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

// A titled, bordered card that visually groups related fields.
export function EditorSection({
  title, description, children, className,
}: { title: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center gap-2.5 border-b bg-zinc-200/80 px-4 py-3 dark:bg-zinc-800/60">
        <span className="h-4 w-1 shrink-0 rounded-full bg-primary" />
        <div>
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {description && <p className="text-xs font-normal text-muted-foreground">{description}</p>}
        </div>
      </div>
      <div className={cn('grid gap-4 p-4', className)}>{children}</div>
    </section>
  );
}

// Editor dialog. With a `preview`, it goes full-size with a live pane on the
// right (posts/programs). Without one, it's a compact centered dialog suited to
// the shorter content types (press, hall of fame, team, results).
export function EditorDialog({
  open, onOpenChange, trigger, title, description, onSubmit, submitLabel = 'Save', preview, children,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; trigger: ReactNode;
  title: string; description?: string; onSubmit: () => void; submitLabel?: string;
  preview?: ReactNode; children: ReactNode;
}) {
  const large = !!preview;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        showCloseButton
        className={cn(
          'flex flex-col gap-0 overflow-hidden p-0',
          large
            ? 'h-[94vh] max-w-[min(1180px,96vw)] sm:max-w-[min(1180px,96vw)]'
            : 'max-h-[88vh] sm:max-w-xl',
        )}
      >
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {large ? (
          <div className="flex min-h-0 flex-1">
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto bg-muted/30 p-6">{children}</div>
            <div className="hidden min-h-0 flex-1 flex-col border-l bg-muted/20 lg:flex">
              <div className="border-b bg-muted/40 px-6 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</div>
              <div className="min-h-0 flex-1 overflow-y-auto p-6">{preview}</div>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-muted/30 p-6">{children}</div>
        )}
        <DialogFooter className="border-t px-6 py-3">
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button onClick={onSubmit}>{submitLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Date picker backed by shadcn's Calendar. Value is an ISO date string
// (yyyy-mm-dd) for storage; the trigger displays dd Mon yyyy regardless of the
// browser locale (native <input type=date> would follow the OS locale).
const parseISO = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : undefined;
};
const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function DateField({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseISO(value) : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" className={cn('justify-start font-normal', !value && 'text-muted-foreground')}>
          <CalendarIcon className="size-4" />
          {value ? dateUK(value) : 'Pick a date'}
          {value && (
            <span role="button" tabIndex={-1} className="ml-auto text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); onChange(''); }}>
              Clear
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={selected} captionLayout="dropdown" autoFocus onSelect={(d) => { onChange(d ? toISO(d) : ''); setOpen(false); }} />
      </PopoverContent>
    </Popover>
  );
}

// Resolve a stored image value to a previewable URL. Repo-backed images
// (/images/..., /assets/uploads/...) are served via the admin-img proxy;
// external https URLs are used directly.
const imgPreviewSrc = (v: string) =>
  !v ? '' : /^https?:\/\//.test(v) ? v : `/admin-img/${v.replace(/^\//, '')}`;

// Image field: URL input + an upload button on the left, live preview on the
// right. Uploads commit the file into the repo source and store its logical url.
export function ImageField({
  value, onChange, prefix, id, hidePreview,
}: { value: string; onChange: (v: string) => void; prefix: string; id?: string; hidePreview?: boolean }) {
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const src = imgPreviewSrc(value);

  const onPick = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const { url } = await api.uploadImage(file, prefix);
      onChange(url);
      toast.success('Image uploaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const uploadBtn = (
    <>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden onChange={(e) => onPick(e.target.files?.[0])} />
      <Button type="button" variant="outline" size="sm" className="shrink-0" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {busy ? 'Uploading...' : 'Upload image'}
      </Button>
      {value && (
        <Button type="button" variant="ghost" size="sm" className="shrink-0 text-muted-foreground" onClick={() => onChange('')}>Clear</Button>
      )}
    </>
  );

  // No preview pane (posts/programs): input + buttons on one row.
  if (hidePreview) {
    return (
      <div className="flex items-center gap-2">
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder="/images/... or https://..." className="min-w-0 flex-1" />
        {uploadBtn}
      </div>
    );
  }

  // With a right-hand thumbnail (press/hall-of-fame/team).
  return (
    <div className="flex items-start gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-2 self-stretch">
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder="/images/... or https://..." />
        <div className="flex items-center gap-2">{uploadBtn}</div>
      </div>
      <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40">
        {src
          ? <img src={src} alt="" className="size-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          : <ImageIcon className="size-5 text-muted-foreground/60" />}
      </div>
    </div>
  );
}

// Markdown body field with a formatting toolbar (bold, italic, heading, list,
// link) that wraps the current selection. Pairs with the side-by-side
// MarkdownPreview pane, so it carries no Write/Preview tabs of its own.
export function MarkdownTextarea({
  value, onChange, id, rows = 14,
}: { value: string; onChange: (v: string) => void; id?: string; rows?: number }) {
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

  const Btn = ({ onClick, title, children }: { onClick: () => void; title: string; children: ReactNode }) => (
    <Button type="button" variant="ghost" size="icon" className="size-7" title={title} onClick={onClick}>{children}</Button>
  );

  return (
    <div className="overflow-hidden rounded-md border">
      <div className="flex items-center gap-0.5 border-b bg-muted/40 px-1.5 py-1">
        <Btn title="Bold" onClick={() => wrap('**', '**', 'bold text')}><Bold className="size-3.5" /></Btn>
        <Btn title="Italic" onClick={() => wrap('*', '*', 'italic text')}><Italic className="size-3.5" /></Btn>
        <Btn title="Heading" onClick={() => prefixLine('## ')}><Heading2 className="size-3.5" /></Btn>
        <Btn title="Bullet list" onClick={() => prefixLine('- ')}><List className="size-3.5" /></Btn>
        <Btn title="Link" onClick={() => wrap('[', '](https://)', 'link text')}><LinkIcon className="size-3.5" /></Btn>
      </div>
      <Textarea
        ref={ref}
        id={id}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        className="rounded-none border-0 font-mono text-sm shadow-none focus-visible:ring-0"
      />
    </div>
  );
}

// Rendered-markdown pane used as the side-by-side preview for body fields. An
// optional cover image renders on top, mirroring how the page displays it.
export function MarkdownPreview({ md, image }: { md: string; image?: string }) {
  const src = image ? imgPreviewSrc(image) : '';
  return (
    <div className="space-y-4">
      {src && (
        <img src={src} alt="" className="w-full rounded-lg border object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
      )}
      <div
        className="max-w-none text-sm [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h2]:mb-1 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold [&_h4]:font-semibold [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(md) || '<p class="text-muted-foreground">Nothing to preview yet.</p>' }}
      />
    </div>
  );
}
