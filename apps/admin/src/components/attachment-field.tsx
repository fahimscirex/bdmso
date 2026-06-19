import { useRef } from 'react';
import { Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

// One attachment ready for Brevo: base64 `content` (no data-URL prefix) plus
// its filename. `size` is the raw byte count, kept for display and the cap.
export type Attachment = { name: string; content: string; size: number };

// Brevo caps a single email at ~10 MB of attachments.
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB';
  return bytes + ' B';
}

export function AttachmentField({ value, onChange }: { value: Attachment[]; onChange: (a: Attachment[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const onPick = async (files: FileList | null) => {
    if (!files?.length) return;
    const picked: Attachment[] = [];
    for (const file of Array.from(files)) {
      try {
        picked.push({ name: file.name, content: await readAsBase64(file), size: file.size });
      } catch {
        toast.error(`Could not read ${file.name}`);
      }
    }
    const next = [...value, ...picked];
    if (next.reduce((n, a) => n + a.size, 0) > MAX_TOTAL_BYTES) {
      toast.error('Attachments exceed 10 MB total');
    } else {
      onChange(next);
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="grid gap-2">
      <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => onPick(e.target.files)} />
      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => inputRef.current?.click()}>
        <Paperclip className="size-3.5" /> Add attachment
      </Button>
      {value.length > 0 && (
        <ul className="grid gap-1">
          {value.map((a, i) => (
            <li key={`${a.name}-${i}`} className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-sm">
              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{a.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatSize(a.size)}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                aria-label={`Remove ${a.name}`}
              >
                <X className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
