// Dedicated Results page (dashboard sub-nav tab). Lists every published exam
// result across the guardian's children. The tab itself is only shown by Shell
// when results exist, but we still render a friendly empty state if reached
// directly with none.
import { useEffect, useState } from 'preact/hooks';
import { loadMe, tierLabel, type ResultReg } from '../me';

export function Results() {
  const [regs, setRegs] = useState<ResultReg[] | null>(null);

  useEffect(() => {
    loadMe().then((d) => setRegs(d.registrations)).catch(() => setRegs([]));
  }, []);

  const withResults = (regs ?? []).filter((r) => r.result);

  return (
    <div class="results-page">
      <div class="page-header">
        <h1>Results</h1>
      </div>
      {regs === null ? (
        <div class="results-grid">
          {[0, 1, 2].map((i) => <div key={i} class="result-card result-card--skeleton" />)}
        </div>
      ) : withResults.length === 0 ? (
        <p class="muted" style="margin-top: -8px;">
          No results have been published yet. They'll appear here once your child's exam is graded and released.
        </p>
      ) : (
        <div class="results-grid">
          {withResults.map((r) => {
            const res = r.result!;
            return (
              <div class="result-card" key={r.id}>
                <div class="result-card-head">
                  <div class="result-info">
                    <div class="result-student">{r.student_full_name}</div>
                    <div class="result-event">{res.event_label}</div>
                  </div>
                  {res.tier && <span class="result-tier">{tierLabel(res.tier)}</span>}
                </div>
                <div class="result-sections">
                  {res.sections.map((s) => (
                    <div class="result-sec" key={s.section}>
                      <span class="result-sec-label">{s.label}</span>
                      <span class="result-sec-score">{s.score}<span class="result-sec-max">/{s.max}</span></span>
                    </div>
                  ))}
                </div>
                <div class="result-foot">
                  <span class="result-total">Total <strong>{res.total}</strong> / {res.max_total}</span>
                  {res.rank != null && <span class="result-rank">Rank #{res.rank}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
