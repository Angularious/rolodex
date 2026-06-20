'use client';

import type { TraceStep, StepStatus } from '@/components/OrchestrationTrace';

function StatusDot({ status }: { status: StepStatus }) {
  const base = 'inline-block w-3.5 text-center shrink-0 font-mono';
  if (status === 'running') return <span className={`${base} text-accent-soft gspace-blink`}>◐</span>;
  if (status === 'done') return <span className={`${base} text-accent-soft`}>✓</span>;
  if (status === 'failed') return <span className={`${base} text-red-400`}>✕</span>;
  if (status === 'empty') return <span className={`${base} text-muted`}>○</span>;
  return <span className={`${base} text-muted`}>·</span>;
}

// Full-area space "mission control" loader shown while a report streams in.
export default function LoadingScreen({ steps, domain }: { steps: TraceStep[]; domain: string }) {
  return (
    <div className="graph-blue relative h-[78vh] min-h-[520px] w-full border border-line overflow-hidden bg-[#04050a] grid place-items-center">
      <div className="flex flex-col items-center gap-8 px-6">
        {/* orbiting system */}
        <div className="gspace-loader" aria-hidden>
          <span className="gspace-core" />
          <span className="gspace-orbit gspace-orbit-1">
            <span className="gspace-dot" />
          </span>
          <span className="gspace-orbit gspace-orbit-2">
            <span className="gspace-dot" />
          </span>
          <span className="gspace-orbit gspace-orbit-3">
            <span className="gspace-dot" />
          </span>
        </div>

        <div className="text-center">
          <div className="font-mono text-[0.66rem] uppercase tracking-[0.25em] text-accent-soft">
            Establishing uplink
          </div>
          <div className="font-display text-2xl text-cream mt-1">{domain}</div>
        </div>

        {/* live step checklist */}
        <ol className="w-full max-w-md space-y-2">
          {steps.map((s) => (
            <li
              key={s.key}
              className="flex items-center gap-3 border border-line bg-ink-2/50 px-3 py-2"
            >
              <StatusDot status={s.status} />
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[0.78rem] text-cream truncate">{s.label}</div>
                <div className="font-mono text-[0.62rem] text-muted truncate">{s.hint}</div>
              </div>
              {s.status === 'done' && s.count != null && (
                <span className="font-mono text-[0.66rem] text-accent-soft shrink-0">
                  {s.count.toLocaleString()} {s.countLabel}
                </span>
              )}
              {s.status === 'failed' && (
                <span className="font-mono text-[0.62rem] text-red-400 shrink-0">failed</span>
              )}
            </li>
          ))}
        </ol>

        <div className="font-mono text-[0.62rem] text-muted/70 tracking-wider gspace-blink">
          Coordinating data operations…
        </div>
      </div>
    </div>
  );
}
