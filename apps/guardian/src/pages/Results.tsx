// Dedicated Results page (dashboard sub-nav tab). Lists every published exam
// result across the guardian's children. The tab itself is only shown by Shell
// when results exist, but we still render a friendly empty state if reached
// directly with none.
import { useEffect, useState } from 'preact/hooks';
import { loadMe, tierLabel, type ResultReg } from '../me';

// dd Mon yyyy (en-GB) - distinguishes which sitting when a program repeats.
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function Results() {
  const [regs, setRegs] = useState<ResultReg[] | null>(null);

  useEffect(() => {
    loadMe().then((d) => setRegs(d.registrations)).catch(() => setRegs([]));
  }, []);

  // One card per (child × published sitting): a registration can carry several
  // results once multiple runs of its program are published (e.g. mock sittings).
  const items = (regs ?? []).flatMap((r) => (r.results ?? []).map((res) => ({ reg: r, res })));

  return (
    <div class="results-page">
      {regs === null ? (
        <div class="results-grid">
          {[0, 1, 2].map((i) => <div key={i} class="result-card result-card--skeleton" />)}
        </div>
      ) : items.length === 0 ? (
        <p class="muted">
          No results have been published yet. They'll appear here once your child's exam is graded and released.
        </p>
      ) : (
        <div class="results-grid">
          {items.map(({ reg: r, res }) => {
            return (
              <div class="result-card" key={`${r.id}|${res.event_key}`}>
                <div class="result-card-head">
                  <div class="result-info">
                    <div class="result-student">{r.student_full_name}</div>
                    <div class="result-event">{res.event_label}</div>
                    {res.event_date && <div class="result-date">{fmtDate(res.event_date)}</div>}
                  </div>
                </div>
                <div class="result-sections">
                  {res.sections.map((s) => (
                    <div class="result-sec" key={s.section}>
                      <div class="result-sec-main">
                        <span class="result-sec-label">{s.label}</span>
                        <span class="result-sec-score">{s.score}<span class="result-sec-max">/{s.max}</span></span>
                      </div>
                      {s.rank != null && (
                        <div class="result-sec-meta">
                          <span class="result-sec-rank">Rank #{s.rank}</span>
                          {s.tier && s.rank <= 3 && <span class="result-tier">{tierLabel(s.tier)}</span>}
                        </div>
                      )}
                      {s.detail && Object.keys(s.detail).length > 0 && (
                        <div class="result-sec-detail">
                          {Object.entries(s.detail).map(([k, v]) => (
                            <span class="result-detail-item" key={k}>{k}: <strong>{v}</strong></span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div class="result-foot">
                  <span class="result-total">Total <strong>{res.total}</strong> / {res.max_total}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
