'use client';

import type { GNodeData } from './layout';
import type { DecisionMaker } from '@/lib/types';

export interface RevealState {
  loading: boolean;
  tried: boolean;
  email: string | null;
  phone: string | null;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex justify-between gap-3 py-1 border-b border-line/60">
      <span className="font-mono text-[0.62rem] uppercase tracking-wider text-muted shrink-0">{label}</span>
      <span className="font-mono text-[0.72rem] text-cream-dim text-right break-words">{value}</span>
    </div>
  );
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`font-mono text-[0.6rem] px-1.5 py-0.5 border rounded-none ${
        ok ? 'border-accent/50 text-accent-soft' : 'border-line text-muted'
      }`}
    >
      {ok ? '✓' : '✕'} {label}
    </span>
  );
}

export default function GraphPanel({
  data,
  onClose,
  reveal,
  revealState,
  onSearchCompany,
  onSwitchToTable,
}: {
  data: GNodeData | null;
  onClose: () => void;
  reveal: (p: DecisionMaker) => void;
  revealState: (p: DecisionMaker) => RevealState | undefined;
  onSearchCompany: (domain: string) => void;
  onSwitchToTable: () => void;
}) {
  if (!data) return null;

  return (
    <aside className="graph-panel absolute right-0 top-0 h-full w-[320px] max-w-[85%] border-l border-line bg-ink-2/95 backdrop-blur-md z-20 flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-line">
        <span className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-accent-soft">
          {data.kind === 'person'
            ? 'Decision-maker'
            : data.kind === 'company'
              ? 'Company'
              : data.kind}
        </span>
        <button onClick={onClose} className="font-mono text-cream-dim hover:text-cream text-sm">
          ✕
        </button>
      </header>

      <div className="px-4 py-3 overflow-y-auto flex-1">
        <h3 className="font-display text-lg text-cream mb-1 break-words">{data.label}</h3>
        {data.sub && <div className="font-mono text-[0.72rem] text-accent-soft mb-3 break-words">{data.sub}</div>}

        {data.kind === 'company' && data.company && (
          <div className="mt-2">
            <Row label="Industry" value={data.company.industries?.[0]} />
            <Row label="HQ" value={data.company.hqLocation} />
            <Row label="Founded" value={data.company.founded} />
            <Row label="Size" value={data.company.size} />
            <Row label="Funding" value={data.company.fundingTotal} />
            <Row label="Stage" value={data.company.fundingStage} />
            {data.company.website && (
              <a
                href={data.company.website}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block font-mono text-[0.72rem] text-accent-soft underline"
              >
                {data.company.website} ↗
              </a>
            )}
          </div>
        )}

        {data.kind === 'person' && data.person && (
          <PersonBody person={data.person} reveal={reveal} state={revealState(data.person)} />
        )}

        {data.kind === 'competitor' && data.competitor && (
          <div className="mt-2">
            <Row label="Domain" value={data.competitor.domain} />
            <Row label="Industry" value={data.competitor.industries} />
            <button
              onClick={() => onSearchCompany(data.competitor!.domain)}
              className="mt-3 w-full font-mono text-[0.72rem] border border-accent/50 text-accent-soft px-3 py-1.5 rounded-none hover:bg-accent/10"
            >
              Run report on this company →
            </button>
          </div>
        )}

        {data.kind === 'department' && (
          <div className="mt-2">
            <Row label="Headcount" value={data.department?.count.toLocaleString()} />
            <button
              onClick={onSwitchToTable}
              className="mt-3 w-full font-mono text-[0.72rem] border border-line text-cream-dim px-3 py-1.5 rounded-none hover:border-accent/50"
            >
              View employees in Table →
            </button>
          </div>
        )}

        {data.kind === 'tech' && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(data.tech ?? []).map((t) => (
              <span key={t} className="font-mono text-[0.66rem] border border-line text-cream-dim px-1.5 py-0.5 rounded-none">
                {t}
              </span>
            ))}
          </div>
        )}

        {data.kind === 'more' && (
          <button
            onClick={onSwitchToTable}
            className="mt-2 w-full font-mono text-[0.72rem] border border-accent/50 text-accent-soft px-3 py-1.5 rounded-none hover:bg-accent/10"
          >
            View all in Table →
          </button>
        )}
      </div>
    </aside>
  );
}

function PersonBody({
  person,
  reveal,
  state,
}: {
  person: DecisionMaker;
  reveal: (p: DecisionMaker) => void;
  state?: RevealState;
}) {
  const noContact = !person.hasWorkEmail && !person.hasPersonalEmail && !person.hasPhone;
  const revealed = state?.email || state?.phone;
  return (
    <div className="mt-2">
      <Row label="Title" value={person.title} />
      <Row label="Function" value={person.jobFunction} />
      <Row label="Seniority" value={person.seniority} />
      <Row label="Location" value={person.location} />

      <div className="flex flex-wrap gap-1.5 mt-3">
        <Badge ok={person.hasWorkEmail} label="Work" />
        <Badge ok={person.hasPersonalEmail} label="Personal" />
        <Badge ok={person.hasPhone} label="Phone" />
      </div>

      {person.linkedin && (
        <a
          href={person.linkedin}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block font-mono text-[0.72rem] text-accent-soft underline"
        >
          LinkedIn ↗
        </a>
      )}

      <div className="mt-4">
        {revealed ? (
          <div className="font-mono text-[0.72rem] text-cream space-y-1">
            {state?.email && <div className="text-accent-soft break-all">{state.email}</div>}
            {state?.phone && <div className="text-accent-soft">{state.phone}</div>}
          </div>
        ) : state?.tried ? (
          <div className="font-mono text-[0.7rem] text-muted">No contact found.</div>
        ) : noContact ? (
          <div className="font-mono text-[0.7rem] text-muted border border-line px-3 py-1.5">
            No contact on file.
          </div>
        ) : (
          <button
            onClick={() => reveal(person)}
            disabled={state?.loading}
            className="w-full font-mono text-[0.72rem] border border-accent/60 text-accent-soft px-3 py-1.5 rounded-none hover:bg-accent/10 disabled:opacity-50"
          >
            {state?.loading ? 'Enriching…' : 'Enrich contact →'}
          </button>
        )}
      </div>
    </div>
  );
}
