// Image picker that wraps a plain URL field. Two ways to set the value:
//   1. paste any URL or /images/* path into the text input
//   2. pick a local file → uploaded to R2, value becomes /r2/<key>
// Shows a thumbnail preview when a value is set.

import { useState } from 'preact/hooks';
import { getToken } from '../auth';

type Props = {
  label: string;
  hint?: string;
  prefix: string;            // R2 folder ("posts" | "programs")
  value: string;
  onChange: (next: string) => void;
};

type UploadResponse = { ok: true; url: string; key: string; size: number; type: string };

export function ImageField({ label, hint, prefix, value, onChange }: Props) {
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('prefix', prefix);
      const token = getToken();
      const res = await fetch('/api/admin/uploads', {
        method: 'POST',
        headers: token ? { authorization: `Bearer ${token}` } : undefined,
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string })?.error || `HTTP ${res.status}`);
      onChange((json as UploadResponse).url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      input.value = '';  // allow re-picking the same file later
    }
  }

  return (
    <div class="field field-full">
      <label>{label}</label>
      <div class="image-field">
        <input
          type="text"
          value={value}
          placeholder="/r2/posts/2026/05/abc.webp  or  https://…"
          onInput={(e) => onChange((e.target as HTMLInputElement).value)}
          style="flex:1;"
        />
        <label class="btn-secondary image-field-upload">
          {busy ? 'Uploading…' : 'Upload'}
          <input type="file" accept="image/*" onChange={pick} disabled={busy} hidden />
        </label>
        {value && (
          <button type="button" class="btn-secondary" onClick={() => onChange('')} disabled={busy} title="Clear">
            ×
          </button>
        )}
      </div>
      {error && <p class="field-hint" style="color:var(--red);">{error}</p>}
      {hint && !error && <p class="field-hint">{hint}</p>}
      {value && (
        <div class="image-field-preview">
          <img src={value} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>
      )}
    </div>
  );
}
