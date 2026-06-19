// Format a press-mention date for display. Accepts a full ISO date or a
// "YYYY-MM" month value (rendered as "Mon YYYY"); falls back to the raw
// string if it can't be parsed. Shared by index.astro and media.astro.
export function fmtPress(iso: string): string {
  if (!iso) return "";
  if (iso.length === 7) {
    const d = new Date(`${iso}-01`);
    return isNaN(+d) ? iso : d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  }
  const d = new Date(iso);
  return isNaN(+d) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
