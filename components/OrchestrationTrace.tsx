'use client';

// Live orchestration strip: shows the report's data operations resolving in
// real time (running → done / empty / failed) with result counts. Makes the
// "one query → many coordinated operations" story visible without naming any
// underlying provider (per the UI's no-provider-names rule) or adding Orthogonal
// branding here (that lives in the header/footer only).

export type StepStatus = 'running' | 'done' | 'empty' | 'failed';

export interface TraceStep {
  key: string;
  label: string;
  hint: string;
  status: StepStatus;
  count?: number | null;
  countLabel?: string;
}

function StepIcon({ status }: { status: StepStatus }) {
  const cls = 'inline-block w-4 text-center shrink-0';
  if (status === 'running') return <span className={`${cls} text-accent animate-pulse`}>◐</span>;
  if (status === 'done') return <span className={`${cls} text-accent-soft`}>✓</span>;
  if (status === 'failed') return <span className={`${cls} text-red-400`}>✕</span>;
  return <span className={`${cls} text-slate`}>○</span>; // empty
}

export default function OrchestrationTrace({
  steps,
  done,
  durationMs,
}: {
  steps: TraceStep[];
  done: boolean;
  durationMs: number;
}) {
  const ran = steps.filter((s) => s.status !== 'running').length;

  return (
    <div className="retro-panel-flat p-3 my-3">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <span className="hud">⚡ Live orchestration</span>
        <span className="text-xs text-slate">
          {done
            ? `${ran} data operation${ran === 1 ? '' : 's'} · ${(durationMs / 1000).toFixed(1)}s`
            : 'Coordinating data operations…'}
        </span>
      </div>
      <ol className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {steps.map((s) => (
          <li
            key={s.key}
            className={`border border-line rounded-md p-2 bg-card flex items-start gap-2 ${
              s.status === 'running' ? 'opacity-100' : ''
            }`}
          >
            <StepIcon status={s.status} />
            <div className="min-w-0">
              <div className="text-sm font-bold truncate">{s.label}</div>
              <div className="text-[0.7rem] text-slate truncate">{s.hint}</div>
              {s.status === 'done' && s.count != null && (
                <div className="text-[0.7rem] text-accent-soft">
                  {s.count.toLocaleString()} {s.countLabel}
                </div>
              )}
              {s.status === 'empty' && <div className="text-[0.7rem] text-slate">none found</div>}
              {s.status === 'failed' && <div className="text-[0.7rem] text-red-400">unavailable</div>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
