// Admin image-preview URL. Images live in the repo (no public/images, no R2);
// the public site serves optimized _astro variants the admin can't address, so
// the worker serves the originals for dashboard previews at
// /admin-img/<logical path>. Remote/data URLs pass through unchanged.
export function previewSrc(path: string | null | undefined): string {
  if (!path) return '';
  if (/^https?:\/\//.test(path) || path.startsWith('data:')) return path;
  return `/admin-img/${path.replace(/^\//, '')}`;
}
