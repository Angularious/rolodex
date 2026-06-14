'use client';

import type { Competitor } from '@/lib/types';
import { Unavailable } from './DepartmentsTab';

export default function CompetitorsTab({
  competitors,
  onSearch,
}: {
  competitors: Competitor[] | null;
  onSearch: (domain: string) => void;
}) {
  if (!competitors) return <Unavailable />;
  if (competitors.length === 0)
    return <div className="retro-panel-flat p-6 text-center text-slate">No similar companies found.</div>;

  return (
    <div className="pop-in">
      <p className="text-sm text-slate mb-3">
        Click a competitor to run its report. Each click counts as a search against your rate limit.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {competitors.map((c) => (
          <button
            key={c.domain}
            onClick={() => onSearch(c.domain)}
            className="retro-panel-flat p-3 text-left hover:bg-neon transition-colors group"
          >
            <div className="font-bold flex items-center justify-between">
              <span className="truncate">{c.name || c.domain}</span>
              <span className="opacity-0 group-hover:opacity-100 transition-opacity font-display">→</span>
            </div>
            <div className="text-sm text-cobalt break-all">{c.domain}</div>
            {c.industries && <div className="text-[0.7rem] text-slate mt-1">{c.industries}</div>}
          </button>
        ))}
      </div>
    </div>
  );
}
