'use client';

import type { Workforce, JobSignal } from '@/lib/types';

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 mt-1.5 rounded-full overflow-hidden bg-card border border-line">
      <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function DepartmentsTab({
  workforce,
  jobs,
  onPickDepartment,
  error,
  onRetry,
}: {
  workforce: Workforce | null;
  jobs?: JobSignal[] | null;
  onPickDepartment: (dept: string) => void;
  error?: boolean;
  onRetry?: () => void;
}) {
  if (!workforce) return error ? <SectionError onRetry={onRetry} /> : <Unavailable />;
  const maxDept = Math.max(1, ...workforce.departments.map((d) => d.count));

  // Optional growth from the headcount history (oldest → newest).
  const hist = workforce.history;
  const growth =
    hist && hist.length > 1
      ? { from: hist[0], to: hist[hist.length - 1] }
      : null;

  return (
    <div className="pop-in">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        <SummaryStat label="Employees" value={workforce.total.toLocaleString()} />
        <SummaryStat label="Range" value={workforce.range ?? '—'} />
        {growth && (
          <SummaryStat
            label={`Since ${growth.from.date.slice(0, 7)}`}
            value={`+${(growth.to.total - growth.from.total).toLocaleString()}`}
          />
        )}
      </div>

      <h3 className="font-display text-xl mb-2">By department</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {workforce.departments.map((d) => (
          <button
            key={d.name}
            onClick={() => onPickDepartment(d.name)}
            className="retro-panel-flat p-3 text-left hover:bg-card-hover hover:border-accent transition-colors"
            title={`Filter employees by ${d.name}`}
          >
            <div className="flex justify-between items-baseline">
              <span className="font-bold">{d.name}</span>
              <span className="font-display text-lg">{d.count.toLocaleString()}</span>
            </div>
            <Bar value={d.count} max={maxDept} />
            {d.delta != null && d.delta !== 0 && (
              <div
                className={`mt-1 text-[0.7rem] font-mono ${d.delta > 0 ? 'text-accent-soft' : 'text-slate'}`}
                title={workforce.growthSince ? `since ${workforce.growthSince}` : undefined}
              >
                {d.delta > 0 ? '+' : ''}
                {d.delta.toLocaleString()}
                {workforce.growthSince ? ` since ${workforce.growthSince}` : ''}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Hiring activity — shown only when job postings are available */}
      {jobs && jobs.length > 0 && (
        <div className="mt-6">
          <h3 className="font-display text-xl mb-2">Hiring activity</h3>
          <div className="space-y-2">
            {jobs.map((j, i) => (
              <a
                key={i}
                href={j.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block retro-panel-flat p-3 hover:bg-card-hover hover:border-accent transition-colors"
              >
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  {j.source && (
                    <span className="font-mono text-[0.65rem] text-muted">{j.source}</span>
                  )}
                </div>
                {j.title && (
                  <div className="font-bold text-sm text-cream leading-snug mb-0.5">{j.title}</div>
                )}
                {j.snippet && (
                  <div className="text-xs text-cream-dim leading-relaxed">{j.snippet}</div>
                )}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="retro-panel-flat p-3 text-center">
      <div className="font-display text-3xl text-accent-soft">{value}</div>
      <div className="text-[0.7rem] uppercase tracking-wide text-slate font-bold">{label}</div>
    </div>
  );
}

export function Unavailable() {
  return (
    <div className="retro-panel-flat p-6 text-center text-slate">
      <div className="text-3xl mb-1">📭</div>
      <div className="font-display text-lg">Data unavailable</div>
      <div className="text-sm">This section wasn&apos;t available for this company.</div>
    </div>
  );
}

// Shown when a section's live data call failed (timeout / upstream blip) rather
// than the company genuinely having no data — distinct copy + a retry path so a
// transient failure doesn't read as "no records."
export function SectionError({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="retro-panel-flat p-6 text-center text-slate">
      <div className="text-3xl mb-1">⚠️</div>
      <div className="font-display text-lg text-accent-soft">Couldn&apos;t load this section</div>
      <div className="text-sm mb-3">A live data call timed out — the rest of the report loaded fine.</div>
      {onRetry && (
        <button onClick={onRetry} className="retro-btn retro-btn-sm retro-btn-blue">
          Retry report
        </button>
      )}
    </div>
  );
}
