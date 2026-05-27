// Tiny inline-SVG sparkline. No d3/recharts/chart.js - just `<polyline>`
// over a normalised range. ~30 LOC, ships as ~1.5 KB gzipped on the bundle.
//
// `data` is the raw series in display order. `tone` picks the stroke
// colour from the existing token palette. `height` controls overall
// height; width is fluid via 100% so the sparkline scales to its
// container.

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

export function Sparkline({ data, tone = 'navy', height = 28, showArea = true }: Props) {
  if (!data || data.length === 0) return null;
  const W = 100; // viewBox width (we let CSS stretch via preserveAspectRatio)
  const H = height;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = data.length > 1 ? W / (data.length - 1) : 0;
  const points = data.map((v, i) => {
    const x = i * step;
    const y = H - ((v - min) / span) * (H - 4) - 2; // 2px padding top/bottom
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const linePath = points.join(' ');
  const areaPath = `0,${H} ${linePath} ${W},${H}`;
  const stroke = TONE_TO_COLOR[tone];

  return (
    <svg
      class="sparkline"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Trend over ${data.length} days`}
    >
      {showArea && (
        <polyline
          points={areaPath}
          fill={stroke}
          fill-opacity="0.12"
          stroke="none"
        />
      )}
      <polyline
        points={linePath}
        fill="none"
        stroke={stroke}
        stroke-width="1.5"
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
