'use client';

import type { LocationCount } from '@/lib/types';
import { countryName, flagEmoji } from '@/lib/format';
import { Unavailable } from './DepartmentsTab';

export default function LocationsTab({ locations }: { locations: LocationCount[] | null }) {
  if (!locations) return <Unavailable />;
  if (locations.length === 0)
    return <div className="retro-panel-flat p-6 text-center text-slate">No location data.</div>;

  const max = Math.max(1, ...locations.map((l) => l.count));

  return (
    <div className="pop-in grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {locations.map((l) => {
        const pct = Math.max(4, Math.round((l.count / max) * 100));
        return (
          <div key={l.country} className="retro-panel-flat p-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl leading-none">{flagEmoji(l.country)}</span>
              <div className="min-w-0">
                <div className="font-bold truncate">{countryName(l.country)}</div>
                <div className="text-[0.7rem] text-slate">{l.country}</div>
              </div>
              <span className="ml-auto font-display text-xl">{l.count}</span>
            </div>
            <div className="h-1.5 mt-2 rounded-full overflow-hidden bg-card border border-line">
              <div className="h-full bg-accent-soft" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
