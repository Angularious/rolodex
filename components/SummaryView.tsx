'use client';

// Mobile-first circuit-aesthetic summary view. Same visual language as the
// CircuitGraph (CIRCUIT_COLOR palette, bracket corners, monospace, dark bg)
// but laid out as stacked panels for small screens.

import { useState, useCallback } from 'react';
import type { Company, Competitor, Workforce, Employee, Signal } from '@/lib/types';
import type { RevealFn } from '@/components/EmployeesTab';
import { CIRCUIT_COLOR } from '@/components/circuit/geometry';
import { Avatar } from '@/components/DecisionMakersTab';
import { useToast } from '@/components/Toast';

const FONT = 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)';

export interface SummaryData {
  domain: string;
  company: Company | null;
  companyError: boolean;
  workforce: Workforce | null;
  workforceLoading: boolean;
  competitors: Competitor[] | null;
  competitorsLoading: boolean;
  employees: Employee[];
  employeesTotal: number;
  employeesLoading: boolean;
  signals: Signal[] | null;
  signalsLoading: boolean;
}

interface RevealState {
  loading: boolean;
  tried: boolean;
  email: string | null; // best email found (first from the multi-source result)
  phone: string | null;
}

type SummaryTab = 'employees' | 'departments' | 'competitors' | 'tech' | 'signals';

// ---------------------------------------------------------------------------
// Bracket corner ornaments (CSS-based, 4 corners)
// ---------------------------------------------------------------------------
function BracketCorners({ color, size = 12, sw = 2 }: { color: string; size?: number; sw?: number }) {
  const base: React.CSSProperties = {
    position: 'absolute',
    width: size,
    height: size,
    pointerEvents: 'none',
  };
  return (
    <>
      <span style={{ ...base, top: -1, left: -1, borderTop: `${sw}px solid ${color}`, borderLeft: `${sw}px solid ${color}` }} />
      <span style={{ ...base, top: -1, right: -1, borderTop: `${sw}px solid ${color}`, borderRight: `${sw}px solid ${color}` }} />
      <span style={{ ...base, bottom: -1, left: -1, borderBottom: `${sw}px solid ${color}`, borderLeft: `${sw}px solid ${color}` }} />
      <span style={{ ...base, bottom: -1, right: -1, borderBottom: `${sw}px solid ${color}`, borderRight: `${sw}px solid ${color}` }} />
    </>
  );
}

// ---------------------------------------------------------------------------
// 2×2 metric chip
// ---------------------------------------------------------------------------
function MetricChip({ label, value, color }: { label: string; value: string | null | undefined; color: string }) {
  return (
    <div style={{ position: 'relative', background: 'rgba(8,11,20,0.68)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: `1px solid ${color}30`, fontFamily: FONT, padding: '10px 12px' }}>
      <BracketCorners color={color} size={10} />
      <div style={{ color: `${color}88`, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ color: '#cfdcea', fontSize: 17, fontWeight: 700, lineHeight: 1.1 }}>{value || '—'}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export default function SummaryView({
  data,
  onReveal,
  onSearchCompany,
}: {
  data: SummaryData;
  onReveal: RevealFn;
  onSearchCompany: (domain: string) => void;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<SummaryTab>('employees');
  const [descExpanded, setDescExpanded] = useState(false);
  const [roundOpen, setRoundOpen] = useState(false);
  const [revealMap, setRevealMap] = useState<Record<string, RevealState>>({});

  const company = data.company;
  const companyLoading = !company && !data.companyError;
  // True headcount for the "Employees" stat: prefer the workforce observed count,
  // fall back to the people-search total. The tab badge shows the loaded sample.
  const totalEmployees = data.workforce?.total ?? (data.employeesTotal || null);

  const tabDefs: { id: SummaryTab; label: string; count: number | null; color: string; loading: boolean }[] = [
    { id: 'employees', label: 'Employees', count: data.employees.length || null, color: CIRCUIT_COLOR.employees, loading: data.employeesLoading },
    { id: 'departments', label: 'Departments', count: data.workforce?.departments.length ?? null, color: CIRCUIT_COLOR.departments, loading: data.workforceLoading },
    { id: 'competitors', label: 'Competitors', count: data.competitors?.length ?? null, color: CIRCUIT_COLOR.competitors, loading: data.competitorsLoading },
    { id: 'tech', label: 'Tech Stack', count: company?.tech.length ?? null, color: CIRCUIT_COLOR.tech, loading: false },
    { id: 'signals', label: 'News', count: data.signals?.length ?? null, color: '#fb923c', loading: data.signalsLoading },
  ];

  const activeColor = tabDefs.find(t => t.id === tab)?.color ?? CIRCUIT_COLOR.employees;

  const reveal = useCallback(async (id: string, payload: { ceId?: string | null; linkedin?: string | null; firstName?: string | null; lastName?: string | null }) => {
    if (revealMap[id]?.loading || revealMap[id]?.tried) return;
    setRevealMap(m => ({ ...m, [id]: { loading: true, tried: false, email: null, phone: null } }));
    try {
      const res = await onReveal(payload);
      const email = res.emails[0]?.email ?? null;
      setRevealMap(m => ({ ...m, [id]: { loading: false, tried: true, email, phone: res.phone } }));
      if (email || res.phone) toast(`Revealed contact`);
      else toast('No contact found');
    } catch {
      setRevealMap(m => ({ ...m, [id]: { loading: false, tried: true, email: null, phone: null } }));
      toast('Reveal failed');
    }
  }, [onReveal, revealMap, toast]);

  return (
    <div style={{ fontFamily: FONT, background: 'transparent', minHeight: '100%', color: '#cfdcea' }} className="pb-16">

      {/* ── Company header ── */}
      {companyLoading ? (
        <HeaderSkeleton domain={data.domain} />
      ) : company ? (
        <div style={{ position: 'relative', background: 'rgba(8,11,20,0.72)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: '1px solid #1c2940', margin: '14px 14px 0' }} className="p-4">
          <BracketCorners color="#4a7fa5" size={14} />
          <div className="flex items-start gap-3">
            {company.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={company.logo}
                alt=""
                onError={(e) => (e.currentTarget.style.display = 'none')}
                style={{ width: 40, height: 40, objectFit: 'contain', border: '1px solid #1c2940', background: 'rgba(3,5,10,0.60)', flexShrink: 0 }}
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span style={{ fontSize: 20, color: '#eaf1ff', fontWeight: 700, letterSpacing: '0.04em', lineHeight: 1.2 }}>
                  {company.name.toUpperCase()}
                </span>
                {company.type && (
                  <span style={{ fontSize: 10, color: '#4a7fa5', border: '1px solid #1c2940', padding: '2px 6px', letterSpacing: '0.16em' }}>
                    {company.type.toUpperCase()}
                  </span>
                )}
              </div>
              <a href={company.website} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#4a7fa5', letterSpacing: '0.1em' }}>
                {company.domain}
              </a>
              {company.description && (
                <div style={{ marginTop: 6 }}>
                  <p style={{ fontSize: 12, color: '#8aa0bd', lineHeight: 1.5 }} className={descExpanded ? '' : 'line-clamp-3'}>
                    {company.description}
                  </p>
                  {company.description.length > 165 && (
                    <button
                      onClick={() => setDescExpanded(v => !v)}
                      style={{ marginTop: 4, fontSize: 10, color: '#4a7fa5', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: FONT, letterSpacing: '0.08em' }}
                    >
                      {descExpanded ? '↑ show less' : '↓ show more'}
                    </button>
                  )}
                </div>
              )}
              {company.industries.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
                  {company.industries.map(ind => (
                    <span key={ind} style={{ fontSize: 9, color: '#6b7a90', border: '1px solid #1c2940', padding: '2px 6px', letterSpacing: '0.1em' }}>
                      {ind}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ margin: '14px 14px 0', padding: '16px', border: '1px solid #1c2940', background: 'rgba(8,11,20,0.65)', textAlign: 'center', color: '#5b6b82', fontSize: 13 }}>
          Company profile unavailable for {data.domain}
        </div>
      )}

      {/* ── Metric grid 2×2 — uniform accent color ── */}
      {company ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, margin: '6px 14px' }}>
          <MetricChip label="Total Funding" value={company.fundingTotal} color="#22d3ee" />
          <MetricChip label="Revenue" value={company.revenue} color="#22d3ee" />
          <MetricChip label="Employees" value={totalEmployees != null ? totalEmployees.toLocaleString() : company.size} color="#22d3ee" />
          <MetricChip label="HQ" value={company.hqLocation} color="#22d3ee" />
        </div>
      ) : companyLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, margin: '6px 14px' }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ height: 60, background: 'rgba(8,11,20,0.55)', border: '1px solid #0e1626' }} className="circ-pulse" />
          ))}
        </div>
      ) : null}

      {/* ── Last raise — expandable detail panel ── */}
      {company && (company.fundingRounds?.length ?? 0) > 0 && (() => {
        const r = company.fundingRounds![0];
        const hasDetail = !!(r.valuation || r.investors || r.description);
        return (
          <div style={{ margin: '6px 14px' }}>
            <button
              onClick={() => hasDetail && setRoundOpen(o => !o)}
              style={{ width: '100%', position: 'relative', background: 'rgba(8,11,20,0.68)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: `1px solid ${CIRCUIT_COLOR.funding}30`, padding: '9px 12px', display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 11, cursor: hasDetail ? 'pointer' : 'default', fontFamily: FONT, textAlign: 'left' }}
            >
              <BracketCorners color={CIRCUIT_COLOR.funding} size={9} />
              <span style={{ color: '#5b6b82', letterSpacing: '0.16em', fontSize: 10, flexShrink: 0 }}>LAST RAISE</span>
              <span style={{ color: CIRCUIT_COLOR.funding, fontWeight: 600, flexShrink: 0 }}>{r.amount || r.type || 'Round'}</span>
              <span style={{ color: '#5b6b82', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {[r.amount ? r.type : null, r.date?.slice(0, 7)].filter(Boolean).join(' · ')}
              </span>
              {hasDetail && (
                <span style={{ color: CIRCUIT_COLOR.funding, fontSize: 10, flexShrink: 0, transition: 'transform 0.2s', display: 'inline-block', transform: roundOpen ? 'rotate(180deg)' : 'none' }}>▼</span>
              )}
            </button>
            {roundOpen && hasDetail && (
              <div style={{ border: `1px solid ${CIRCUIT_COLOR.funding}30`, borderTop: 0, background: 'rgba(5,8,16,0.72)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                {r.valuation && (
                  <div style={{ display: 'flex', gap: 10, fontSize: 11 }}>
                    <span style={{ color: '#5b6b82', letterSpacing: '0.12em', fontSize: 10, minWidth: 80 }}>VALUATION</span>
                    <span style={{ color: '#cfdcea', fontWeight: 600 }}>{r.valuation}</span>
                  </div>
                )}
                {r.investors && (
                  <div style={{ display: 'flex', gap: 10, fontSize: 11, alignItems: 'flex-start' }}>
                    <span style={{ color: '#5b6b82', letterSpacing: '0.12em', fontSize: 10, minWidth: 80, flexShrink: 0 }}>INVESTORS</span>
                    <span style={{ color: '#cfdcea' }}>{r.investors}</span>
                  </div>
                )}
                {r.description && (
                  <p style={{ color: '#8aa0bd', fontSize: 11, lineHeight: 1.5, margin: 0, borderTop: '1px solid #0e1626', paddingTop: 8 }}>{r.description}</p>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Tab row (horizontally scrollable) ── */}
      <div className="no-scrollbar" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'], padding: '10px 14px 0', display: 'flex', gap: 4 }}>
        {tabDefs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flexShrink: 0,
              padding: '7px 12px',
              fontSize: 10,
              letterSpacing: '0.18em',
              cursor: 'pointer',
              transition: 'all 0.2s',
              border: `1px solid ${tab === t.id ? t.color : '#1c2940'}`,
              background: tab === t.id ? `${t.color}18` : 'rgba(8,11,20,0.45)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              color: tab === t.id ? t.color : '#4a5a6e',
              boxShadow: tab === t.id ? `0 0 10px ${t.color}28` : 'none',
              fontFamily: FONT,
              position: 'relative',
              minWidth: 'max-content',
            }}
          >
            {tab === t.id && <BracketCorners color={t.color} size={7} />}
            {t.loading && t.count == null
              ? `${t.label.toUpperCase()} ···`
              : `${t.label.toUpperCase()}${t.count != null ? ` · ${t.count}` : ''}`}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div style={{ margin: '8px 14px', position: 'relative', border: `1px solid ${activeColor}22`, background: 'rgba(5,8,16,0.52)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', padding: 12 }}>
        <BracketCorners color={activeColor} size={12} />

        {tab === 'employees' && (
          <EmployeesPane
            employees={data.employees}
            total={totalEmployees}
            loading={data.employeesLoading}
            revealMap={revealMap}
            onReveal={reveal}
          />
        )}
        {tab === 'departments' && (
          <DepartmentsPane workforce={data.workforce} loading={data.workforceLoading} />
        )}
        {tab === 'competitors' && (
          <CompetitorsPane
            competitors={data.competitors}
            loading={data.competitorsLoading}
            onSearch={onSearchCompany}
          />
        )}
        {tab === 'tech' && (
          <TechPane tech={company?.tech ?? []} loading={companyLoading} />
        )}
        {tab === 'signals' && (
          <SignalsPane signals={data.signals} loading={data.signalsLoading} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeletons
// ---------------------------------------------------------------------------
function HeaderSkeleton({ domain }: { domain: string }) {
  return (
    <div style={{ margin: '14px 14px 0', border: '1px solid #0e1626', background: 'rgba(8,11,20,0.65)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', padding: 16 }} className="circ-pulse">
      <div style={{ fontSize: 11, color: '#3b4a60', letterSpacing: '0.2em', marginBottom: 8 }}>RESOLVING · {domain.toUpperCase()}</div>
      <div style={{ height: 22, background: '#0e1626', width: '55%', marginBottom: 8 }} />
      <div style={{ height: 12, background: '#0e1626', width: '90%', marginBottom: 5 }} />
      <div style={{ height: 12, background: '#0e1626', width: '70%' }} />
    </div>
  );
}

function PaneLoadingSkeleton({ rows, chip }: { rows: number; chip?: boolean }) {
  if (chip) {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {Array.from({ length: rows * 3 }).map((_, i) => (
          <div key={i} style={{ width: 70 + (i % 3) * 28, height: 44, background: 'rgba(14,22,38,0.55)' }} className="circ-pulse" />
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ height: 52, background: 'rgba(14,22,38,0.50)', opacity: Math.max(0.3, 1 - i * 0.15) }} className="circ-pulse" />
      ))}
    </div>
  );
}

function EmptyPane({ label }: { label: string }) {
  return (
    <div style={{ padding: '24px 0', textAlign: 'center', color: '#3b4a60', fontSize: 12, letterSpacing: '0.12em' }}>
      {label.toUpperCase()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Employees pane
// ---------------------------------------------------------------------------
function EmployeesPane({
  employees,
  total,
  loading,
  revealMap,
  onReveal,
}: {
  employees: Employee[];
  total: number | null;
  loading: boolean;
  revealMap: Record<string, RevealState>;
  onReveal: (id: string, payload: { ceId?: string | null; linkedin?: string | null; firstName?: string | null; lastName?: string | null }) => void;
}) {
  if (loading && employees.length === 0) return <PaneLoadingSkeleton rows={6} />;
  if (employees.length === 0) return <EmptyPane label="No employees found" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {total != null && total > employees.length && (
        <div style={{ fontSize: 10, letterSpacing: '0.16em', color: '#5b6b82', textTransform: 'uppercase' }}>
          Showing {employees.length} of {total.toLocaleString()} employees
        </div>
      )}
      {employees.map((e, i) => {
        const id = e.ceId || e.linkedin || e.fullName;
        return (
          <PersonRow
            key={`${id}-${i}`}
            name={e.fullName}
            sub={e.title || ''}
            meta={[e.department, e.seniority, e.location].filter(Boolean).join(' · ')}
            photo={e.photo}
            linkedin={e.linkedin}
            color={CIRCUIT_COLOR.employees}
            st={revealMap[id]}
            onReveal={() => onReveal(id, { ceId: e.ceId, linkedin: e.linkedin, firstName: e.firstName, lastName: e.lastName })}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared person row
// ---------------------------------------------------------------------------
function PersonRow({
  name,
  sub,
  meta,
  photo,
  linkedin,
  color,
  noContact,
  st,
  onReveal,
}: {
  name: string;
  sub: string;
  meta: string;
  photo?: string | null;
  linkedin?: string | null;
  color: string;
  noContact?: boolean;
  st?: RevealState;
  onReveal: () => void;
}) {
  const got = st?.email || st?.phone;

  const btnBase: React.CSSProperties = {
    fontSize: 9, letterSpacing: '0.14em', padding: '5px 11px',
    fontFamily: FONT, cursor: 'pointer', transition: 'all 0.2s', background: 'transparent',
  };

  return (
    <div style={{ background: 'rgba(8,11,20,0.70)', border: '1px solid #1a2535' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px 6px' }}>
        <Avatar src={photo} name={name} size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#eaf1ff', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
          {sub && <div style={{ color: '#8aa0bd', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
          {meta && <div style={{ color: '#4a5a6e', fontSize: 10, letterSpacing: '0.05em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta}</div>}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px 10px', flexWrap: 'wrap' }}>
        {linkedin && (
          <a
            href={linkedin}
            target="_blank"
            rel="noreferrer"
            style={{ ...btnBase, border: '1px solid #3b7dbf60', color: '#5b9bd5', textDecoration: 'none', display: 'inline-block' }}
          >
            LINKEDIN ↗
          </a>
        )}
        {got ? (
          <div style={{ fontSize: 11 }}>
            {st?.email && <span style={{ color, fontWeight: 500, wordBreak: 'break-all' }}>{st.email}</span>}
            {st?.phone && <span style={{ color, marginLeft: st.email ? 8 : 0 }}>{st.phone}</span>}
          </div>
        ) : st?.tried ? (
          <span style={{ ...btnBase, border: '1px solid #1c2940', color: '#2a3a50', cursor: 'default' }}>NO CONTACT FOUND</span>
        ) : noContact ? (
          <span style={{ ...btnBase, border: '1px solid #1c2940', color: '#2a3a50', cursor: 'default' }}>NO CONTACT</span>
        ) : (
          <button
            onClick={onReveal}
            disabled={st?.loading}
            style={{
              ...btnBase,
              border: `1px solid ${color}60`,
              color: st?.loading ? `${color}60` : color,
              background: st?.loading ? `${color}08` : 'transparent',
              cursor: st?.loading ? 'default' : 'pointer',
              minWidth: 88,
              boxShadow: st?.loading ? 'none' : `0 0 8px ${color}15`,
            }}
          >
            {st?.loading ? '···' : 'GET EMAIL'}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Departments pane
// ---------------------------------------------------------------------------
function DepartmentsPane({ workforce, loading }: { workforce: Workforce | null; loading: boolean }) {
  if (loading && !workforce) return <PaneLoadingSkeleton rows={6} />;
  if (!workforce || workforce.departments.length === 0) return <EmptyPane label="No department data" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {workforce.departments.map(d => (
        <div
          key={d.name}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '9px 12px', background: 'rgba(8,11,20,0.60)', border: `1px solid ${CIRCUIT_COLOR.departments}22`, position: 'relative' }}
        >
          <BracketCorners color={CIRCUIT_COLOR.departments} size={7} sw={1} />
          <span style={{ color: '#cfdcea', fontSize: 12, flex: 1, letterSpacing: '0.04em' }}>{d.name}</span>
          {d.delta != null && d.delta !== 0 && (
            <span style={{ color: d.delta > 0 ? CIRCUIT_COLOR.employees : '#5b6b82', fontSize: 10, letterSpacing: '0.08em', minWidth: 40, textAlign: 'right' }}>
              {d.delta > 0 ? '+' : ''}{d.delta.toLocaleString()}
            </span>
          )}
          <span style={{ color: CIRCUIT_COLOR.departments, fontSize: 15, fontWeight: 700, minWidth: 52, textAlign: 'right', letterSpacing: '-0.01em' }}>
            {d.count.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Competitors pane
// ---------------------------------------------------------------------------
function CompetitorsPane({
  competitors,
  loading,
  onSearch,
}: {
  competitors: Competitor[] | null;
  loading: boolean;
  onSearch: (domain: string) => void;
}) {
  if (loading && !competitors) return <PaneLoadingSkeleton rows={5} />;
  if (!competitors || competitors.length === 0) return <EmptyPane label="No competitors found" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {competitors.map(c => (
        <button
          key={c.domain}
          onClick={() => onSearch(c.domain)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            padding: '10px 12px',
            background: 'rgba(8,11,20,0.60)',
            border: `1px solid ${CIRCUIT_COLOR.competitors}22`,
            cursor: 'pointer',
            textAlign: 'left',
            fontFamily: FONT,
            width: '100%',
            position: 'relative',
            transition: 'border-color 0.2s',
          }}
        >
          <BracketCorners color={CIRCUIT_COLOR.competitors} size={7} sw={1} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#cfdcea', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || c.domain}</div>
            <div style={{ color: CIRCUIT_COLOR.competitors, fontSize: 10, letterSpacing: '0.08em', opacity: 0.8 }}>{c.domain}</div>
          </div>
          <span style={{ color: CIRCUIT_COLOR.competitors, fontSize: 16, flexShrink: 0 }}>→</span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tech stack pane
// ---------------------------------------------------------------------------
function TechPane({ tech, loading }: { tech: string[]; loading: boolean }) {
  if (loading && tech.length === 0) return <PaneLoadingSkeleton rows={2} chip />;
  if (tech.length === 0) return <EmptyPane label="No tech stack data" />;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
      {tech.map(t => (
        <div
          key={t}
          style={{ position: 'relative', background: 'rgba(8,11,20,0.60)', border: `1px solid ${CIRCUIT_COLOR.tech}30`, padding: '5px 10px' }}
        >
          <BracketCorners color={CIRCUIT_COLOR.tech} size={7} />
          <span style={{ color: CIRCUIT_COLOR.tech, fontSize: 11, letterSpacing: '0.08em' }}>{t}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// News / signals pane
// ---------------------------------------------------------------------------
const SIGNAL_COLOR: Record<string, string> = {
  funding: '#fb923c',
  product: '#34d399',
  customer: '#22d3ee',
  general: '#8aa0bd',
};

function SignalsPane({ signals, loading }: { signals: Signal[] | null; loading: boolean }) {
  if (loading && !signals) return <PaneLoadingSkeleton rows={4} />;
  if (!signals || signals.length === 0) return <EmptyPane label="No recent news found" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {signals.map((s, i) => {
        const color = SIGNAL_COLOR[s.category] ?? SIGNAL_COLOR.general;
        return (
          <a
            key={i}
            href={s.url}
            target="_blank"
            rel="noreferrer"
            style={{ display: 'block', background: 'rgba(8,11,20,0.70)', border: `1px solid ${color}22`, padding: '10px 12px', textDecoration: 'none', position: 'relative' }}
          >
            <BracketCorners color={color} size={7} sw={1} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <span style={{ fontSize: 9, letterSpacing: '0.16em', color, border: `1px solid ${color}40`, padding: '1px 5px', flexShrink: 0 }}>
                {s.category.toUpperCase()}
              </span>
              {s.source && (
                <span style={{ fontSize: 9, color: '#5b6b82', letterSpacing: '0.08em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.source}
                </span>
              )}
            </div>
            {s.title && (
              <div style={{ color: '#cfdcea', fontSize: 12, fontWeight: 600, lineHeight: 1.35, marginBottom: 3 }}>{s.title}</div>
            )}
            {s.snippet && (
              <p style={{ color: '#8aa0bd', fontSize: 11, lineHeight: 1.45, margin: 0 }} className="line-clamp-3">{s.snippet}</p>
            )}
          </a>
        );
      })}
    </div>
  );
}
