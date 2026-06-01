// Smooth-curve SVG sparkline with gradient fill underneath. No d3/
// recharts/chart.js - a tiny Catmull-Rom-to-Bezier interpolation makes
// every segment a cubic curve through the data points, and a
// <linearGradient> fades the area from the stroke colour down to
// transparent at the baseline.

import { useId } from 'preact/hooks';

type Props = {
  data: number[];
  tone?: 'navy' | 'green' | 'amber' | 'red';
  height?: number;
  showArea?: boolean;
};

const TONE_TO_COLOR: Record<NonNullable<Props['tone']>, string> = {
  navy:  'var(--accent)',
  green: 'var(--green)',
  amber: 'var(--amber)',
  red:   'var(--red)',
};

// Build an SVG path that smoothly interpolates the given points using
// Catmull-Rom splines converted to cubic Beziers. For each segment
// between p[i] and p[i+1] we use p[i-1] and p[i+2] as control
// neighbours, mirroring at the ends.
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  if (pts.length === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;
  const TENSION = 0.18; // 0 = straight lines, ~0.2 = smooth but not loopy
  let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) * TENSION;
    const c1y = p1.y + (p2.y - p0.y) * TENSION;
    const c2x = p2.x - (p3.x - p1.x) * TENSION;
    const c2y = p2.y - (p3.y - p1.y) * TENSION;
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}

export function Sparkline({ data, tone = 'navy', height = 36, showArea = true }: Props) {
  // Stable per-instance id so multiple gradients on one page don't collide.
  const gradId = useId();
  if (!data || data.length === 0) return null;
  const W = 100;
  const H = height;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = data.length > 1 ? W / (data.length - 1) : 0;
  const padTop = 3, padBot = 2;
  const pts = data.map((v, i) => ({
    x: i * step,
    y: H - ((v - min) / span) * (H - padTop - padBot) - padBot,
  }));
  const linePath = smoothPath(pts);
  const areaPath = `${linePath} L${pts[pts.length - 1].x.toFixed(2)},${H} L${pts[0].x.toFixed(2)},${H} Z`;
  const stroke = TONE_TO_COLOR[tone];
  const gid = `sl-${String(gradId).replace(/[:]/g, '-')}`;

  return (
    <svg
      class="sparkline"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Trend over ${data.length} days`}
    >
      {showArea && (
        <>
          <defs>
            <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%"   stop-color={stroke} stop-opacity="0.28" />
              <stop offset="100%" stop-color={stroke} stop-opacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#${gid})`} stroke="none" />
        </>
      )}
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

/** Pad a server-returned daily series so missing days become 0. Takes
 *  rows shaped `{ day: 'YYYY-MM-DD', total: N }` and returns an array
 *  of values for the last `days` days, oldest-first. */
export function padDailySeries<T extends { day: string }>(
  rows: T[],
  days: number,
  pick: (r: T) => number,
): number[] {
  const byDay = new Map(rows.map((r) => [r.day, pick(r)]));
  const out: number[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    out.push(byDay.get(iso) ?? 0);
  }
  return out;
}
