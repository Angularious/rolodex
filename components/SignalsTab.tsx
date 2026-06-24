'use client';

import type { Signal } from '@/lib/types';

const CATEGORY_LABELS: Record<Signal['category'], string> = {
  funding: 'Funding',
  product: 'Product',
  customer: 'Customer',
  general: 'News',
};

// Inline Tailwind classes per category (mirrors EmployeesTab's badge approach).
const CATEGORY_CLASSES: Record<Signal['category'], string> = {
  funding:  'text-emerald-400 border-emerald-400/40 bg-emerald-400/10',
  product:  'text-sky-400 border-sky-400/40 bg-sky-400/10',
  customer: 'text-violet-400 border-violet-400/40 bg-violet-400/10',
  general:  'text-muted border-line bg-card',
};

export default function SignalsTab({
  signals,
  loading,
  error,
}: {
  signals: Signal[] | null;
  loading: boolean;
  error?: boolean;
}) {
  if (loading) return <SignalsSkeleton />;
  if (error) return <SectionError />;
  if (!signals || !signals.length) return <Unavailable />;

  return (
    <div className="pop-in space-y-3">
      {signals.map((s, i) => (
        <a
          key={i}
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block retro-panel-flat p-3 hover:bg-card-hover hover:border-accent transition-colors"
        >
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span
              className={`inline-block text-[0.55rem] uppercase tracking-wide border rounded px-1 py-px font-bold ${CATEGORY_CLASSES[s.category]}`}
            >
              {CATEGORY_LABELS[s.category]}
            </span>
            {s.source && (
              <span className="font-mono text-[0.65rem] text-muted">{s.source}</span>
            )}
          </div>
          {s.title && (
            <div className="font-bold text-sm text-cream leading-snug mb-1">{s.title}</div>
          )}
          {s.snippet && (
            <div className="text-xs text-cream-dim leading-relaxed">{s.snippet}</div>
          )}
        </a>
      ))}
    </div>
  );
}

function SignalsSkeleton() {
  return (
    <div className="space-y-3 pop-in">
      {[1, 2, 3].map((i) => (
        <div key={i} className="retro-panel-flat p-3 animate-pulse">
          <div className="flex gap-2 mb-2">
            <div className="h-4 w-14 rounded bg-card" />
            <div className="h-4 w-24 rounded bg-card" />
          </div>
          <div className="h-4 w-3/4 rounded bg-card mb-1" />
          <div className="h-3 w-full rounded bg-card" />
        </div>
      ))}
    </div>
  );
}

function Unavailable() {
  return (
    <div className="retro-panel-flat p-6 text-center text-slate">
      <div className="font-display text-lg">No recent signals found</div>
      <div className="text-sm">No news, launches, or customer mentions surfaced for this company.</div>
    </div>
  );
}

function SectionError() {
  return (
    <div className="retro-panel-flat p-6 text-center text-slate">
      <div className="font-display text-lg text-accent-soft">Signals unavailable</div>
      <div className="text-sm">Web search timed out — other sections loaded fine.</div>
    </div>
  );
}
