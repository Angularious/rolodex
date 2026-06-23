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
    <div className="graph-blue fixed inset-0 z-50 overflow-hidden bg-black/70 backdrop-blur-[2px] grid place-items-center">
      <div className="flex flex-col items-center gap-7 px-6 w-full">
        {/* orbiting system — centered */}
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

        {/* minimal horizontal steps — no boxes */}
        <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-3 max-w-3xl">
          {steps.map((s, i) => (
            <div
              key={s.key}
              className="gspace-reveal flex items-center gap-2"
              style={{ animationDelay: `${i * 0.45}s` }}
            >
              <StatusDot status={s.status} />
              <span
                className={`font-mono text-[0.8rem] ${
                  s.status === 'running' ? 'text-cream' : s.status === 'done' ? 'text-cream-dim' : 'text-muted'
                }`}
              >
                {s.label}
              </span>
              {s.status === 'done' && s.count != null && (
                <span className="font-mono text-[0.72rem] text-accent-soft">
                  {s.count.toLocaleString()} {s.countLabel}
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="font-mono text-[0.62rem] text-muted/70 tracking-wider gspace-blink">
          Coordinating data operations…
        </div>
      </div>
    </div>
  );
}
