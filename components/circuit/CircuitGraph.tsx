'use client';

// Circuit-schematic drill-down view. Self-contained visual identity (pure black,
// neon orthogonal line-art, monospace) — deliberately NOT themed like the rest of
// the site. Plain SVG with computed coordinates + a CSS-transform "camera"; no
// force simulation, no Three.js. Fed by the same in-memory report as the table
// view (no new fetch).

import { useCallback, useMemo, useState } from 'react';
import type { GraphData } from '@/components/graph/types';
import type { DecisionMaker, Employee } from '@/lib/types';
import type { RevealFn } from '@/components/EmployeesTab';
import {
  buildBuses,
  busRect,
  trunk,
  grid,
  cameraFor,
  ROOT,
  VIEW,
  type Bus,
  type SubNode,
  type OutDir,
} from './geometry';

const FONT = 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)';
const TRACE = '#cfdcea'; // neutral trunk/trace color

interface RevealState { loading: boolean; tried: boolean; email: string | null; phone: string | null; }

// ---------------------------------------------------------------------------
// Small SVG primitives
// ---------------------------------------------------------------------------
function Corners({ x, y, w, h, len = 14, color, sw = 2 }: { x: number; y: number; w: number; h: number; len?: number; color: string; sw?: number }) {
  const L = len;
  const seg = (d: string) => <path d={d} stroke={color} strokeWidth={sw} fill="none" strokeLinecap="square" />;
  return (
    <g>
      {seg(`M ${x} ${y + L} L ${x} ${y} L ${x + L} ${y}`)}
      {seg(`M ${x + w - L} ${y} L ${x + w} ${y} L ${x + w} ${y + L}`)}
      {seg(`M ${x + w} ${y + h - L} L ${x + w} ${y + h} L ${x + w - L} ${y + h}`)}
      {seg(`M ${x + L} ${y + h} L ${x} ${y + h} L ${x} ${y + h - L}`)}
    </g>
  );
}

function ArrowHead({ x, y, dir, color }: { x: number; y: number; dir: OutDir; color: string }) {
  const s = 9;
  const pts =
    dir === 'left' ? `${x},${y} ${x + s},${y - s} ${x + s},${y + s}`
    : dir === 'right' ? `${x},${y} ${x - s},${y - s} ${x - s},${y + s}`
    : dir === 'up' ? `${x},${y} ${x - s},${y + s} ${x + s},${y + s}`
    : `${x},${y} ${x - s},${y - s} ${x + s},${y - s}`;
  return <polygon points={pts} fill={color} />;
}

function Chevron({ x, y, dir, color }: { x: number; y: number; dir: OutDir; color: string }) {
  const s = 5;
  const d =
    dir === 'down' ? `M ${x - s} ${y - s} L ${x} ${y} L ${x + s} ${y - s}`
    : `M ${x - s} ${y - s} L ${x} ${y} L ${x - s} ${y + s}`;
  return <path d={d} stroke={color} strokeWidth={1.6} fill="none" opacity={0.85} />;
}

// chip glyph centered in a sub-node
function Chip({ cx, cy, color }: { cx: number; cy: number; color: string }) {
  return (
    <g stroke={color} strokeWidth={1.4} fill="none" opacity={0.9}>
      <rect x={cx - 7} y={cy - 7} width={14} height={14} />
      <line x1={cx - 7} y1={cy} x2={cx - 11} y2={cy} />
      <line x1={cx + 7} y1={cy} x2={cx + 11} y2={cy} />
      <line x1={cx} y1={cy - 7} x2={cx} y2={cy - 11} />
      <line x1={cx} y1={cy + 7} x2={cx} y2={cy + 11} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Sub-node chip in a cluster grid
// ---------------------------------------------------------------------------
function GridChip({ x, y, color, node, active, onClick }: { x: number; y: number; color: string; node: SubNode; active: boolean; onClick: () => void }) {
  const S = 52;
  const label = node.label.length > 16 ? node.label.slice(0, 15) + '…' : node.label;
  const photo = node.person?.photo ?? node.employee?.photo ?? null;
  return (
    <g style={{ cursor: 'pointer' }} onClick={onClick} className="circ-chip">
      <rect x={x - S / 2} y={y - S / 2} width={S} height={S} fill={active ? color : '#05070b'} opacity={active ? 0.16 : 0.9} />
      <Corners x={x - S / 2} y={y - S / 2} w={S} h={S} len={11} color={color} sw={active ? 2.4 : 1.6} />
      {photo ? (
        <g>
          <defs>
            <clipPath id={`cp-${node.id}`}><circle cx={x} cy={y} r={18} /></clipPath>
          </defs>
          <image href={photo} x={x - 18} y={y - 18} width={36} height={36} clipPath={`url(#cp-${node.id})`} preserveAspectRatio="xMidYMid slice" />
          <circle cx={x} cy={y} r={18} fill="none" stroke={color} strokeWidth={1.2} opacity={0.6} />
        </g>
      ) : (
        <Chip cx={x} cy={y} color={color} />
      )}
      <text x={x} y={y + S / 2 + 16} textAnchor="middle" fontFamily={FONT} fontSize={12} fill={TRACE} opacity={0.85}>
        {label}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export default function CircuitGraph({
  data,
  onReveal,
  onSearchCompany,
}: {
  data: GraphData;
  onReveal: RevealFn;
  onSearchCompany: (domain: string) => void;
  onSwitchToTable?: () => void;
}) {
  const buses = useMemo(() => buildBuses(data), [data]);
  const [focused, setFocused] = useState<Bus | null>(null);
  const [selected, setSelected] = useState<{ node: SubNode; color: string } | null>(null);
  const [revealMap, setRevealMap] = useState<Record<string, RevealState>>({});

  const cam = cameraFor(focused?.slot ?? null);

  const stats = useMemo(() => {
    const nodes = 1 + buses.reduce((s, b) => s + b.count, 0);
    const links = buses.length + buses.reduce((s, b) => s + b.count, 0);
    return { nodes, links, buses: buses.length };
  }, [buses]);

  const reset = useCallback(() => {
    setFocused(null);
    setSelected(null);
  }, []);

  const focusBus = useCallback((b: Bus) => {
    setFocused((cur) => (cur?.cat === b.cat ? cur : b));
    setSelected(null);
  }, []);

  const reveal = useCallback(
    async (id: string, payload: { ceId?: string | null; linkedin?: string | null }) => {
      setRevealMap((m) => (m[id]?.loading || m[id]?.tried ? m : { ...m, [id]: { loading: true, tried: false, email: null, phone: null } }));
      try {
        const res = await onReveal(payload);
        setRevealMap((m) => ({ ...m, [id]: { loading: false, tried: true, email: res.email, phone: res.phone ?? null } }));
      } catch {
        setRevealMap((m) => ({ ...m, [id]: { loading: false, tried: true, email: null, phone: null } }));
      }
    },
    [onReveal],
  );

  const company = data.company;
  const rootLabel = company?.name || data.domain;

  return (
    <div className="absolute inset-0 overflow-hidden bg-black/85 text-white" style={{ fontFamily: FONT }}>
      {/* ---------------- schematic ---------------- */}
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full">
        <defs>
          <filter id="cglow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <pattern id="cgrid" width="44" height="44" patternUnits="userSpaceOnUse">
            <path d="M 44 0 L 0 0 0 44" fill="none" stroke="#0e1626" strokeWidth="1" />
          </pattern>
        </defs>

        <rect x={0} y={0} width={VIEW} height={VIEW} fill="url(#cgrid)" opacity={0.5} />

        <g
          style={{
            transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.scale})`,
            transformOrigin: '0 0',
            transition: 'transform 0.7s cubic-bezier(.4,0,.2,1)',
          }}
        >
          {/* trunks + bus boxes */}
          {buses.map((b) => {
            const r = busRect(b.slot);
            const t = trunk(b.slot);
            const isFocus = focused?.cat === b.cat;
            const dim = focused && !isFocus ? 0.32 : 1;
            return (
              <g key={b.cat} style={{ opacity: dim, transition: 'opacity 0.5s' }}>
                {/* trunk trace */}
                {t.double ? (
                  <g filter="url(#cglow)">
                    <line x1={t.from.x} y1={t.from.y - 3} x2={t.to.x} y2={t.to.y - 3} stroke={TRACE} strokeWidth={2.4} />
                    <line x1={t.from.x} y1={t.from.y + 3} x2={t.to.x} y2={t.to.y + 3} stroke={TRACE} strokeWidth={2.4} />
                  </g>
                ) : (
                  <path d={t.path} stroke={TRACE} strokeWidth={2.4} fill="none" filter="url(#cglow)" />
                )}
                {t.ticks.map((tk, i) => (
                  <line key={i} x1={tk.x1} y1={tk.y1} x2={tk.x2} y2={tk.y2} stroke={TRACE} strokeWidth={1.2} opacity={0.6} />
                ))}
                {t.dots.map((d, i) => (
                  <circle key={i} cx={d.x} cy={d.y} r={3.4} fill={TRACE} />
                ))}
                {t.vias.map((v, i) => (
                  <circle key={i} cx={v.x} cy={v.y} r={5} fill="#05070b" stroke={TRACE} strokeWidth={1.6} />
                ))}
                <ArrowHead x={t.arrow.x} y={t.arrow.y} dir={t.arrow.dir} color={TRACE} />

                {/* bus box */}
                <g style={{ cursor: 'pointer' }} onClick={() => focusBus(b)}>
                  <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="#05070b" stroke={b.color} strokeWidth={isFocus ? 2.4 : 1.4} filter={isFocus ? 'url(#cglow)' : undefined} opacity={0.96} />
                  <Corners x={r.x - 5} y={r.y - 5} w={r.w + 10} h={r.h + 10} len={14} color={b.color} sw={1.6} />
                  <text x={r.cx} y={r.cy + 5} textAnchor="middle" fontFamily={FONT} fontSize={15} letterSpacing="1" fill={b.color}>
                    {b.title} · {b.count.toLocaleString()}
                  </text>
                  {/* outer connector terminal */}
                  <rect
                    x={(b.slot === 'left' || b.slot === 'bottomLeft' ? r.x - 12 : r.x + r.w + 2)}
                    y={r.cy - 5}
                    width={10}
                    height={10}
                    fill={b.color}
                  />
                </g>
              </g>
            );
          })}

          {/* focused cluster grid */}
          {focused && <ClusterGrid key={focused.cat} bus={focused} onPick={(node) => setSelected({ node, color: focused.color })} selectedId={selected?.node.id ?? null} />}

          {/* root node */}
          <g style={{ cursor: focused ? 'pointer' : 'default' }} onClick={focused ? reset : undefined}>
            <rect x={ROOT.x - ROOT.s / 2} y={ROOT.y - ROOT.s / 2} width={ROOT.s} height={ROOT.s} fill="#05070b" stroke="#ffffff" strokeWidth={2} filter="url(#cglow)" />
            <Corners x={ROOT.x - ROOT.s / 2 - 7} y={ROOT.y - ROOT.s / 2 - 7} w={ROOT.s + 14} h={ROOT.s + 14} len={20} color="#ffffff" sw={2.4} />
            {/* chip logo */}
            <g stroke="#eaf1ff" strokeWidth={3} fill="none" strokeLinejoin="round" filter="url(#cglow)">
              <path d={`M ${ROOT.x - 30} ${ROOT.y + 22} L ${ROOT.x} ${ROOT.y - 28} L ${ROOT.x + 30} ${ROOT.y + 22} Z`} />
              <path d={`M ${ROOT.x - 14} ${ROOT.y + 22} L ${ROOT.x} ${ROOT.y - 2} L ${ROOT.x + 14} ${ROOT.y + 22}`} />
            </g>
            <text x={ROOT.x} y={ROOT.y + ROOT.s / 2 + 30} textAnchor="middle" fontFamily={FONT} fontSize={24} letterSpacing="1" fill="#ffffff">
              {rootLabel.toUpperCase()}
            </text>
            <text x={ROOT.x} y={ROOT.y + ROOT.s / 2 + 52} textAnchor="middle" fontFamily={FONT} fontSize={13} letterSpacing="2" fill="#6b7a90">
              PRIMARY ORIGIN · {data.domain}
            </text>
          </g>
        </g>
      </svg>

      {/* ---------------- chrome overlays (fixed, do not pan) ---------------- */}
      {/* top-left: title + overview */}
      <div className="absolute top-5 left-6 select-none pointer-events-none">
        <div className="text-[0.7rem] tracking-[0.32em] text-[#5b6b82]">RELATIONSHIP MAP</div>
        <div className="text-2xl tracking-wide text-white mt-1 mb-3">{rootLabel}</div>
        <div className="border w-[260px]" style={{ borderColor: '#1c2940' }}>
          <div className="px-4 py-3" style={{ borderColor: '#1c2940' }}>
            <div className="text-[0.66rem] tracking-[0.28em] text-[#5b6b82] mb-3">NETWORK OVERVIEW</div>
            <StatRow k="NODES" v={stats.nodes.toLocaleString()} accent="#22d3ee" />
            <StatRow k="LINKS" v={stats.links.toLocaleString()} accent="#22d3ee" />
            <StatRow k="BUSES" v={String(stats.buses)} accent="#22d3ee" />
            <div className="h-px my-2" style={{ background: '#1c2940' }} />
            <StatRow k="STATUS" v="OPERATIONAL" accent="#34d399" />
          </div>
        </div>
      </div>

      {/* breadcrumb */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 flex items-center gap-2 text-[0.72rem] tracking-[0.22em]">
        <button onClick={reset} className={focused ? 'text-[#8aa0bd] hover:text-white' : 'text-white'}>
          ROOT
        </button>
        {focused && (
          <>
            <span className="text-[#3b4a60]">/</span>
            <span style={{ color: focused.color }}>{focused.title}</span>
          </>
        )}
      </div>

      {/* right detail panel */}
      <DetailPanel
        selected={selected}
        onClose={() => setSelected(null)}
        onSearchCompany={onSearchCompany}
        reveal={reveal}
        revealMap={revealMap}
      />
    </div>
  );
}

function StatRow({ k, v, accent }: { k: string; v: string; accent: string }) {
  return (
    <div className="flex justify-between items-baseline py-1 text-[0.78rem]">
      <span style={{ color: accent }}>{k}</span>
      <span className="text-[#cfdcea]">{v}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cluster grid (rendered only for the focused bus)
// ---------------------------------------------------------------------------
function ClusterGrid({ bus, onPick, selectedId }: { bus: Bus; onPick: (n: SubNode) => void; selectedId: string | null }) {
  const g = useMemo(() => grid(bus), [bus]);
  return (
    <g className="circ-fade-in">
      <path d={g.busTrace} stroke={bus.color} strokeWidth={1.6} strokeDasharray="3 4" fill="none" opacity={0.8} />
      {g.rail && <path d={g.rail} stroke={bus.color} strokeWidth={1.8} fill="none" opacity={0.8} />}
      <rect x={g.terminal.x - 5} y={g.terminal.y - 5} width={10} height={10} fill={bus.color} />
      {g.stubs.map((d, i) => (
        <path key={`s${i}`} d={d} stroke={bus.color} strokeWidth={1.6} fill="none" opacity={0.75} />
      ))}
      {g.depthLines.map((d, i) => (
        <path key={`d${i}`} d={d} stroke={bus.color} strokeWidth={1.6} fill="none" opacity={0.75} />
      ))}
      {g.chevrons.map((c, i) => (
        <Chevron key={`c${i}`} x={c.x} y={c.y} dir={c.dir} color={bus.color} />
      ))}
      {g.nodes.map((gn) => (
        <GridChip key={gn.node.id} x={gn.x} y={gn.y} color={bus.color} node={gn.node} active={selectedId === gn.node.id} onClick={() => onPick(gn.node)} />
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Right-side detail panel — terminal-style readout
// ---------------------------------------------------------------------------
function PRow({ k, v }: { k: string; v: React.ReactNode }) {
  if (v == null || v === '') return null;
  return (
    <div className="flex justify-between gap-3 py-1 text-[0.78rem]">
      <span className="text-[#5b6b82] tracking-[0.12em]">{k}</span>
      <span className="text-[#cfdcea] text-right break-words">{v}</span>
    </div>
  );
}

function DetailPanel({
  selected,
  onClose,
  onSearchCompany,
  reveal,
  revealMap,
}: {
  selected: { node: SubNode; color: string } | null;
  onClose: () => void;
  onSearchCompany: (domain: string) => void;
  reveal: (id: string, payload: { ceId?: string | null; linkedin?: string | null }) => void;
  revealMap: Record<string, RevealState>;
}) {
  const open = !!selected;
  const node = selected?.node;
  const color = selected?.color ?? '#22d3ee';

  return (
    <div
      className="fixed sm:absolute inset-0 sm:inset-auto sm:top-0 sm:right-0 sm:h-full sm:w-[360px] z-50 bg-black/98 sm:bg-black/95 backdrop-blur-sm border-t sm:border-t-0 sm:border-l overflow-y-auto"
      style={{
        borderColor: '#1c2940',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.45s cubic-bezier(.4,0,.2,1)',
      }}
    >
      {node && (
        <div className="p-5" style={{ fontFamily: FONT }}>
          <div className="flex items-start justify-between gap-2 pb-3 mb-3 border-b" style={{ borderColor: '#1c2940' }}>
            <div className="min-w-0">
              <div className="text-[0.62rem] tracking-[0.28em]" style={{ color }}>
                {kindLabel(node.kind)}
              </div>
              <div className="text-lg text-white break-words leading-tight mt-1">{node.label}</div>
              {node.sub && <div className="text-[0.74rem] text-[#8aa0bd] mt-0.5">{node.sub}</div>}
            </div>
            <button onClick={onClose} className="text-[#5b6b82] hover:text-white">✕</button>
          </div>

          {node.kind === 'person' && node.person && <PersonBody person={node.person} id={node.id} color={color} reveal={reveal} st={revealMap[node.id]} />}
          {node.kind === 'employee' && node.employee && <EmployeeBody emp={node.employee} id={node.id} color={color} reveal={reveal} st={revealMap[node.id]} />}
          {node.kind === 'department' && node.department && (
            <div>
              <PRow k="HEADCOUNT" v={node.department.count.toLocaleString()} />
              {node.department.delta != null && node.department.delta !== 0 && (
                <PRow k="GROWTH" v={`${node.department.delta > 0 ? '+' : ''}${node.department.delta.toLocaleString()}`} />
              )}
            </div>
          )}
          {node.kind === 'competitor' && node.competitor && (
            <div>
              <PRow k="DOMAIN" v={node.competitor.domain} />
              <PRow k="INDUSTRY" v={node.competitor.industries} />
              <button
                onClick={() => onSearchCompany(node.competitor!.domain)}
                className="mt-4 w-full text-[0.74rem] tracking-[0.12em] border px-3 py-2 hover:bg-white/5"
                style={{ borderColor: color, color }}
              >
                RUN REPORT →
              </button>
            </div>
          )}
          {node.kind === 'tech' && <PRow k="TECHNOLOGY" v={node.tech} />}
          {node.kind === 'funding' && node.round && (
            <div>
              <PRow k="ROUND" v={node.round.type} />
              <PRow k="AMOUNT" v={node.round.amount} />
              <PRow k="VALUATION" v={node.round.valuation} />
              <PRow k="DATE" v={node.round.date} />
              <PRow k="INVESTORS" v={node.round.investors} />
            </div>
          )}

          <div className="border-t mt-4 pt-3 text-[0.7rem] text-[#5b6b82] flex items-center gap-2" style={{ borderColor: '#1c2940' }}>
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} /> SOURCE · ORTHOGONAL · LIVE
          </div>
        </div>
      )}
    </div>
  );
}

function kindLabel(k: SubNode['kind']): string {
  return { person: 'DECISION-MAKER', employee: 'EMPLOYEE', department: 'DEPARTMENT', competitor: 'COMPETITOR', tech: 'TECHNOLOGY', funding: 'FUNDING ROUND' }[k];
}

function RevealBlock({ id, color, ceId, linkedin, reveal, st, noContact }: { id: string; color: string; ceId?: string | null; linkedin?: string | null; reveal: (id: string, p: { ceId?: string | null; linkedin?: string | null }) => void; st?: RevealState; noContact?: boolean }) {
  const got = st?.email || st?.phone;
  return (
    <div className="mt-4">
      {got ? (
        <div className="text-[0.76rem] space-y-1">
          {st?.email && <div style={{ color }} className="break-all">{st.email}</div>}
          {st?.phone && <div style={{ color }}>{st.phone}</div>}
        </div>
      ) : st?.tried ? (
        <div className="text-[0.72rem] text-[#5b6b82]">NO CONTACT FOUND.</div>
      ) : noContact ? (
        <div className="text-[0.72rem] text-[#5b6b82] border px-3 py-2" style={{ borderColor: '#1c2940' }}>NO CONTACT ON FILE.</div>
      ) : (
        <button
          onClick={() => reveal(id, { ceId, linkedin })}
          disabled={st?.loading}
          className="w-full text-[0.74rem] tracking-[0.12em] border px-3 py-2 hover:bg-white/5 disabled:opacity-50"
          style={{ borderColor: color, color }}
        >
          {st?.loading ? 'ENRICHING…' : 'ENRICH CONTACT →'}
        </button>
      )}
    </div>
  );
}

function PersonBody({ person, id, color, reveal, st }: { person: DecisionMaker; id: string; color: string; reveal: (id: string, p: { ceId?: string | null; linkedin?: string | null }) => void; st?: RevealState }) {
  const noContact = !person.hasWorkEmail && !person.hasPersonalEmail && !person.hasPhone;
  return (
    <div>
      {person.photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={person.photo} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} className="w-16 h-16 object-cover border mb-3" style={{ borderColor: '#1c2940' }} />
      )}
      <PRow k="TITLE" v={person.title} />
      <PRow k="FUNCTION" v={person.jobFunction} />
      <PRow k="SENIORITY" v={person.seniority} />
      <PRow k="LOCATION" v={person.location} />
      {person.followers != null && <PRow k="FOLLOWERS" v={person.followers.toLocaleString()} />}
      {person.summary && <p className="mt-3 text-[0.74rem] leading-relaxed text-[#9fb1c6] line-clamp-5">{person.summary}</p>}
      {person.experience && person.experience.length > 0 && (
        <div className="mt-3">
          <div className="text-[0.6rem] tracking-[0.24em] text-[#5b6b82] mb-1">EXPERIENCE</div>
          <ul className="text-[0.72rem] text-[#9fb1c6] space-y-0.5">{person.experience.map((x, i) => <li key={i}>· {x}</li>)}</ul>
        </div>
      )}
      {person.education && person.education.length > 0 && (
        <div className="mt-3">
          <div className="text-[0.6rem] tracking-[0.24em] text-[#5b6b82] mb-1">EDUCATION</div>
          <ul className="text-[0.72rem] text-[#9fb1c6] space-y-0.5">{person.education.map((x, i) => <li key={i}>· {x}</li>)}</ul>
        </div>
      )}
      {person.skills && person.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {person.skills.map((s) => (
            <span key={s} className="text-[0.62rem] tracking-[0.08em] border px-1.5 py-0.5 text-[#9fb1c6]" style={{ borderColor: '#1c2940' }}>{s}</span>
          ))}
        </div>
      )}
      {person.linkedin && (
        <a href={person.linkedin} target="_blank" rel="noreferrer" className="inline-block mt-3 text-[0.72rem]" style={{ color }}>
          LINKEDIN ↗
        </a>
      )}
      <RevealBlock id={id} color={color} linkedin={person.linkedin} reveal={reveal} st={st} noContact={noContact} />
    </div>
  );
}

function EmployeeBody({ emp, id, color, reveal, st }: { emp: Employee; id: string; color: string; reveal: (id: string, p: { ceId?: string | null; linkedin?: string | null }) => void; st?: RevealState }) {
  return (
    <div>
      {emp.photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={emp.photo} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} className="w-16 h-16 object-cover border mb-3" style={{ borderColor: '#1c2940' }} />
      )}
      <PRow k="TITLE" v={emp.title} />
      <PRow k="DEPARTMENT" v={emp.department} />
      <PRow k="SENIORITY" v={emp.seniority} />
      <PRow k="LOCATION" v={emp.location} />
      {emp.startedAt && <PRow k="SINCE" v={emp.startedAt.slice(0, 4)} />}
      {emp.linkedin && (
        <a href={emp.linkedin} target="_blank" rel="noreferrer" className="inline-block mt-3 text-[0.72rem]" style={{ color }}>
          LINKEDIN ↗
        </a>
      )}
      <RevealBlock id={id} color={color} ceId={emp.ceId} linkedin={emp.linkedin} reveal={reveal} st={st} />
    </div>
  );
}
