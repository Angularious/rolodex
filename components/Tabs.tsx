'use client';

export type TabId = 'employees' | 'decisionmakers' | 'departments' | 'competitors';

export interface TabDef {
  id: TabId;
  label: string;
  count: number | null;
}

export default function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: TabId;
  onChange: (id: TabId) => void;
}) {
  return (
    <div className="flex flex-wrap border-b border-line mt-2">
      {tabs.map((t) => (
        <button
          key={t.id}
          data-active={t.id === active}
          className="retro-tab"
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.count !== null && (
            <span className="badge badge-slate ml-2 align-middle">{t.count.toLocaleString()}</span>
          )}
        </button>
      ))}
    </div>
  );
}
