'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import SpaceGraph, { type SpaceGraphHandle } from './SpaceGraph';
import {
  CATEGORY_COLOR,
  CATEGORY_LABEL,
  type Category,
  type GraphData,
  type GNodeData,
} from './types';
import type { DecisionMaker } from '@/lib/types';
import type { RevealFn } from '@/components/EmployeesTab';

interface RevealState {
  loading: boolean;
  tried: boolean;
  email: string | null;
  phone: string | null;
}
const keyOf = (p: DecisionMaker) => p.linkedin || p.name;

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-muted mb-2">{children}</div>
);
const Row = ({ k, v }: { k: string; v: React.ReactNode }) =>
  v == null || v === '' ? null : (
    <div className="flex justify-between gap-3 py-1 text-[0.78rem]">
      <span className="text-muted">{k}</span>
      <span className="text-cream-dim text-right break-words font-mono">{v}</span>
    </div>
  );

export default function GraphHUD({
  data,
  onReveal,
  onSearchCompany,
}: {
  data: GraphData;
  onReveal: RevealFn;
  onSearchCompany: (domain: string) => void;
  onSwitchToTable: () => void;
}) {
  const spaceRef = useRef<SpaceGraphHandle>(null);
  const [selected, setSelected] = useState<GNodeData | null>(null);
  const [hidden, setHidden] = useState<Set<Category>>(new Set());
  const [revealMap, setRevealMap] = useState<Record<string, RevealState>>({});

  const counts = useMemo(() => {
    const c: Record<Exclude<Category, 'company'>, number> = {
      people: data.decisionMakers?.length ?? 0,
      departments: data.workforce?.departments.length ?? 0,
      competitors: data.competitors?.length ?? 0,
      funding: data.company?.fundingRounds?.length ?? 0,
      tech: data.company?.tech?.length ?? 0,
    };
    return c;
  }, [data]);
  const total = 1 + Object.values(counts).reduce((s, n) => s + n, 0);

  const toggle = (cat: Category) =>
    setHidden((h) => {
      const n = new Set(h);
      n.has(cat) ? n.delete(cat) : n.add(cat);
      return n;
    });

  const reveal = useCallback(
    async (p: DecisionMaker) => {
      const k = keyOf(p);
      setRevealMap((m) => (m[k]?.loading || m[k]?.tried ? m : { ...m, [k]: { loading: true, tried: false, email: null, phone: null } }));
      try {
        const res = await onReveal({ linkedin: p.linkedin });
        setRevealMap((m) => ({ ...m, [k]: { loading: false, tried: true, email: res.email, phone: res.phone ?? null } }));
      } catch {
        setRevealMap((m) => ({ ...m, [k]: { loading: false, tried: true, email: null, phone: null } }));
      }
    },
    [onReveal],
  );

  return (
    <div className="graph-blue flex flex-col h-full bg-[#050608] text-cream">
      <div className="flex-1 flex min-h-0">
        {/* ---------------- left: legend + toolbar ---------------- */}
        <aside className="hidden lg:flex w-[260px] shrink-0 border-r border-line/60 flex-col">
          <div className="m-3 border border-line/60 bg-[#0a0c10]">
            <div className="px-3 py-2 border-b border-line/60">
              <SectionTitle>Legend</SectionTitle>
            </div>
            <ul className="px-3 py-2">
              {(Object.keys(CATEGORY_LABEL) as Exclude<Category, 'company'>[]).map((cat) => (
                <li key={cat}>
                  <button
                    onClick={() => toggle(cat)}
                    className={`w-full flex items-center gap-2.5 py-1.5 text-[0.8rem] transition-opacity ${
                      hidden.has(cat) ? 'opacity-35' : 'opacity-100'
                    }`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: CATEGORY_COLOR[cat], boxShadow: `0 0 8px ${CATEGORY_COLOR[cat]}` }} />
                    <span className="flex-1 text-left text-cream-dim">{CATEGORY_LABEL[cat]}</span>
                    <span className="font-mono text-muted">{counts[cat]}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="px-3 py-2 border-t border-line/60 flex justify-between text-[0.78rem]">
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">Total Entities</span>
              <span className="font-mono text-cream">{total}</span>
            </div>
          </div>

          <div className="mx-3 mt-1 flex flex-col gap-2">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                title={t.title}
                onClick={t.id === 'reset' ? () => spaceRef.current?.resetView() : undefined}
                className={`h-9 w-9 grid place-items-center border rounded-none transition-colors ${
                  t.id === 'select' ? 'border-accent/60 text-accent-soft' : 'border-line/60 text-muted hover:text-cream hover:border-accent/40'
                }`}
              >
                {t.glyph}
              </button>
            ))}
          </div>
        </aside>

        {/* ---------------- center: viewport ---------------- */}
        <section className="relative flex-1 min-w-0">
          <SpaceGraph ref={spaceRef} data={data} onSelect={setSelected} hidden={hidden} />

          {/* compass */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none select-none font-mono text-[0.55rem] text-muted/70 text-center">
            <div>N</div>
            <div className="flex items-center gap-1">
              <span>W</span>
              <span className="inline-block h-4 w-4 border border-line/70 rotate-45" />
              <span>E</span>
            </div>
            <div>S</div>
          </div>

          {/* focal crosshair brackets (center) */}
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <div className="relative h-24 w-24 gspace-blink opacity-50">
              {['top-0 left-0 border-t border-l', 'top-0 right-0 border-t border-r', 'bottom-0 left-0 border-b border-l', 'bottom-0 right-0 border-b border-r'].map((c) => (
                <span key={c} className={`absolute h-4 w-4 border-accent-soft ${c}`} />
              ))}
            </div>
          </div>

          {/* mini-map */}
          <div className="absolute bottom-4 left-4 hidden sm:block pointer-events-none">
            <div className="h-20 w-20 border border-line/60 bg-[#0a0c10]/80 grid place-items-center">
              <span className="inline-block h-8 w-8 border border-line/70 rotate-12" style={{ transform: 'rotateX(55deg) rotateZ(45deg)' }} />
            </div>
            <div className="font-mono text-[0.55rem] tracking-wider text-muted mt-1">3D PERSPECTIVE</div>
          </div>
        </section>

        {/* ---------------- right: entity inspector ---------------- */}
        <aside
          className={`${
            selected ? 'absolute inset-y-0 right-0 z-20 w-[300px] max-w-[88%]' : 'hidden'
          } lg:relative lg:block lg:z-auto lg:w-[280px] shrink-0 border-l border-line/60 bg-[#0a0c10]/95 backdrop-blur-md overflow-y-auto`}
        >
          {selected ? (
            <EntityDetails
              node={selected}
              onClose={() => setSelected(null)}
              reveal={reveal}
              revealState={(p) => revealMap[keyOf(p)]}
              onSearchCompany={onSearchCompany}
            />
          ) : (
            <div className="p-4 text-[0.78rem] text-muted">
              <SectionTitle>Entity Details</SectionTitle>
              Select a node to inspect.
            </div>
          )}
        </aside>
      </div>

      {/* ---------------- bottom: status strip ---------------- */}
      <div className="hidden md:block border-t border-line/60 bg-[#0a0c10]/90 px-5 py-2.5">
        <div className="flex items-center gap-6 font-mono text-[0.66rem] text-muted">
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 gspace-blink" /> GRAPH STATUS: LIVE
          </span>
          <span>ENTITIES: {total}</span>
          <span>RELATIONSHIPS: {total - 1}</span>
          <span className="ml-auto">{data.domain}</span>
        </div>
      </div>
    </div>
  );
}

const TOOLS = [
  { id: 'select', title: 'Select', glyph: '⌖' },
  { id: 'box', title: 'Box select', glyph: '▢' },
  { id: 'network', title: 'Network', glyph: '⧉' },
  { id: 'reset', title: 'Reset / fit view', glyph: '⟳' },
  { id: 'filter', title: 'Filters', glyph: '≑' },
  { id: 'layers', title: 'Layers', glyph: '☰' },
] as const;

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[0.6rem] uppercase tracking-wide border border-line/70 text-cream-dim px-1.5 py-0.5">
      {children}
    </span>
  );
}

function EntityDetails({
  node,
  onClose,
  reveal,
  revealState,
  onSearchCompany,
}: {
  node: GNodeData;
  onClose: () => void;
  reveal: (p: DecisionMaker) => void;
  revealState: (p: DecisionMaker) => RevealState | undefined;
  onSearchCompany: (domain: string) => void;
}) {
  const typeLabel: Record<string, string> = {
    company: 'Company', person: 'Decision-maker', department: 'Department',
    competitor: 'Competitor', fundingRound: 'Funding round', tech: 'Technology',
  };
  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-2 border-b border-line/60 pb-3 mb-3">
        <div className="min-w-0">
          <SectionTitle>Entity Details</SectionTitle>
          <div className="font-display text-lg text-cream break-words leading-tight">{node.label}</div>
          <div className="font-mono text-[0.66rem] text-muted mt-0.5">{typeLabel[node.kind] ?? node.kind}</div>
        </div>
        <button onClick={onClose} className="text-muted hover:text-cream lg:hidden">✕</button>
      </div>

      {node.kind === 'company' && node.company && (
        <div className="mb-4">
          <Row k="Domain" v={node.company.domain} />
          <Row k="Founded" v={node.company.founded} />
          <Row k="Size" v={node.company.size} />
          <Row k="Revenue" v={node.company.revenue} />
          <Row k="Funding" v={node.company.fundingTotal} />
          <Row k="Industry" v={node.company.industries?.[0]} />
        </div>
      )}

      {node.kind === 'person' && node.person && (
        <PersonBody person={node.person} reveal={reveal} state={revealState(node.person)} />
      )}

      {node.kind === 'department' && (
        <div className="mb-4"><Row k="Headcount" v={node.department?.count.toLocaleString()} /></div>
      )}

      {node.kind === 'competitor' && node.competitor && (
        <div className="mb-4">
          <Row k="Domain" v={node.competitor.domain} />
          <Row k="Industry" v={node.competitor.industries} />
          <button
            onClick={() => onSearchCompany(node.competitor!.domain)}
            className="mt-3 w-full font-mono text-[0.72rem] border border-accent/50 text-accent-soft px-3 py-1.5 hover:bg-accent/10"
          >
            Run report →
          </button>
        </div>
      )}

      {node.kind === 'fundingRound' && node.round && (
        <div className="mb-4">
          <Row k="Round" v={node.round.type} />
          <Row k="Amount" v={node.round.amount} />
          <Row k="Date" v={node.round.date} />
          <Row k="Investors" v={node.round.investors} />
        </div>
      )}

      {node.kind === 'tech' && (
        <div className="mb-4 flex flex-wrap gap-1.5"><Chip>{node.tech}</Chip></div>
      )}

      <div className="border-t border-line/60 pt-3">
        <SectionTitle>Source</SectionTitle>
        <div className="font-mono text-[0.7rem] text-cream-dim flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-soft" /> Orthogonal · live
        </div>
      </div>
    </div>
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
    <div className="mb-4">
      <Row k="Title" v={person.title} />
      <Row k="Function" v={person.jobFunction} />
      <Row k="Seniority" v={person.seniority} />
      <Row k="Location" v={person.location} />

      <div className="flex flex-wrap gap-1.5 my-3">
        {person.seniority && <Chip>{person.seniority}</Chip>}
        {person.jobFunction && <Chip>{person.jobFunction}</Chip>}
      </div>

      {person.linkedin && (
        <a href={person.linkedin} target="_blank" rel="noreferrer" className="font-mono text-[0.72rem] text-accent-soft underline">
          LinkedIn ↗
        </a>
      )}

      <div className="mt-3">
        {revealed ? (
          <div className="font-mono text-[0.72rem] space-y-1">
            {state?.email && <div className="text-accent-soft break-all">{state.email}</div>}
            {state?.phone && <div className="text-accent-soft">{state.phone}</div>}
          </div>
        ) : state?.tried ? (
          <div className="font-mono text-[0.7rem] text-muted">No contact found.</div>
        ) : noContact ? (
          <div className="font-mono text-[0.7rem] text-muted border border-line/70 px-3 py-1.5">No contact on file.</div>
        ) : (
          <button
            onClick={() => reveal(person)}
            disabled={state?.loading}
            className="w-full font-mono text-[0.72rem] border border-accent/60 text-accent-soft px-3 py-1.5 hover:bg-accent/10 disabled:opacity-50"
          >
            {state?.loading ? 'Enriching…' : 'Enrich contact →'}
          </button>
        )}
      </div>
    </div>
  );
}
