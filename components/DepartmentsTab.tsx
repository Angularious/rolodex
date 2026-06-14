'use client';

import type { Counts } from '@/lib/types';

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 mt-1 border border-ink/40 rounded-sm overflow-hidden bg-white">
      <div className="h-full bg-cobalt" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function DepartmentsTab({
  counts,
  onPickDepartment,
}: {
  counts: Counts | null;
  onPickDepartment: (dept: string) => void;
}) {
  if (!counts) return <Unavailable />;
  const maxDept = Math.max(1, ...counts.departments.map((d) => d.count));
  const maxSen = Math.max(1, ...counts.seniority.map((d) => d.count));

  return (
    <div className="pop-in">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        <SummaryStat label="Total emails" value={counts.total.toLocaleString()} />
        <SummaryStat label="Personal" value={counts.personalEmails.toLocaleString()} />
        <SummaryStat label="Generic" value={counts.genericEmails.toLocaleString()} />
      </div>

      <h3 className="font-display text-xl mb-2">By department</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
        {counts.departments.map((d) => (
          <button
            key={d.name}
            onClick={() => onPickDepartment(d.name)}
            className="retro-panel-flat p-3 text-left hover:bg-neon transition-colors"
            title={`Filter employees by ${d.name}`}
          >
            <div className="flex justify-between items-baseline">
              <span className="font-bold">{d.name}</span>
              <span className="font-display text-lg">{d.count}</span>
            </div>
            <Bar value={d.count} max={maxDept} />
          </button>
        ))}
      </div>

      {counts.seniority.length > 0 && (
        <>
          <h3 className="font-display text-xl mb-2">By seniority</h3>
          <div className="grid grid-cols-3 gap-3">
            {counts.seniority.map((d) => (
              <div key={d.name} className="retro-panel-flat p-3">
                <div className="flex justify-between items-baseline">
                  <span className="font-bold">{d.name}</span>
                  <span className="font-display text-lg">{d.count}</span>
                </div>
                <Bar value={d.count} max={maxSen} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="retro-panel-flat p-3 text-center">
      <div className="font-display text-3xl text-cobalt">{value}</div>
      <div className="text-[0.7rem] uppercase tracking-wide text-slate font-bold">{label}</div>
    </div>
  );
}

export function Unavailable() {
  return (
    <div className="retro-panel-flat p-6 text-center text-slate">
      <div className="text-3xl mb-1">📭</div>
      <div className="font-display text-lg">Data unavailable</div>
      <div className="text-sm">Tomba didn&apos;t return this section for the company.</div>
    </div>
  );
}
