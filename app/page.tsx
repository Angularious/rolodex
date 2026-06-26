'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { readSearchStream } from '@/lib/stream';
import { normalizeInput } from '@/lib/normalize';
import type {
  Company,
  Competitor,
  Workforce,
  Employee,
  FormatPattern,
  RevealResult,
  SearchError,
  Signal,
  JobSignal,
} from '@/lib/types';
import { ToastProvider } from '@/components/Toast';
import CompanyCard, { CompanyCardSkeleton } from '@/components/CompanyCard';
import Tabs, { type TabId } from '@/components/Tabs';
import EmployeesTab from '@/components/EmployeesTab';
import DepartmentsTab from '@/components/DepartmentsTab';
import CompetitorsTab from '@/components/CompetitorsTab';
import SignalsTab from '@/components/SignalsTab';
import dynamic from 'next/dynamic';
import { type TraceStep } from '@/components/OrchestrationTrace';
import LoadingScreen from '@/components/graph/LoadingScreen';
import { SAMPLE } from '@/components/graph/sample';
import SummaryView from '@/components/SummaryView';
import { CIRCUIT_COLOR } from '@/components/circuit/geometry';

// Circuit-schematic drill-down view — client-only (SVG-heavy, no SSR needed).
const CircuitGraph = dynamic(() => import('@/components/circuit/CircuitGraph'), {
  ssr: false,
  loading: () => <div className="h-full w-full" />,
});
import ErrorScreen from '@/components/ErrorScreen';
import Footer from '@/components/Footer';
import FieldBackground from '@/components/FieldBackground';


interface Report {
  domain: string;
  inputEcho: string;
  resolvedFrom: string | null;
  company: Company | null;
  companyError: boolean;
  workforce: Workforce | null;
  workforceLoading: boolean;
  workforceError: boolean;
  competitors: Competitor[] | null;
  competitorsLoading: boolean;
  competitorsError: boolean;
  employees: Employee[];
  employeesTotal: number;
  employeesLoading: boolean;
  employeesError: boolean;
  signals: Signal[] | null;
  signalsLoading: boolean;
  signalsError: boolean;
  jobs: JobSignal[] | null;
  jobsLoading: boolean;
  jobsError: boolean;
  cost: number;
  durationMs: number;
  emailFormat: FormatPattern[];
}

function freshReport(inputEcho: string): Report {
  return {
    domain: inputEcho,
    inputEcho,
    resolvedFrom: null,
    company: null,
    companyError: false,
    workforce: null,
    workforceLoading: true,
    workforceError: false,
    competitors: null,
    competitorsLoading: true,
    competitorsError: false,
    employees: [],
    employeesTotal: 0,
    employeesLoading: true,
    employeesError: false,
    signals: null,
    signalsLoading: true,
    signalsError: false,
    jobs: null,
    jobsLoading: true,
    jobsError: false,
    cost: 0,
    durationMs: 0,
    emailFormat: [],
  };
}

// Derive the live orchestration steps from the report's section state. Labels
// are capability-based (never name a provider) and ordered as a logical pipeline
// even though the calls actually fan out in parallel.
function buildTrace(r: Report, done: boolean): TraceStep[] {
  const status = (loading: boolean, error: boolean, present: boolean): TraceStep['status'] =>
    error ? 'failed' : present ? 'done' : loading ? 'running' : 'empty';

  return [
    {
      key: 'company',
      label: 'Resolve company',
      hint: 'Profile · funding · tech',
      status: status(!done && !r.company && !r.companyError, r.companyError, !!r.company),
    },
    {
      key: 'workforce',
      label: 'Map workforce',
      hint: 'Headcount by department',
      status: status(r.workforceLoading, r.workforceError, !!r.workforce),
      count: r.workforce?.departments.length ?? null,
      countLabel: 'departments',
    },
    {
      key: 'employees',
      label: 'Find people',
      hint: 'Employee roster',
      status: status(r.employeesLoading, r.employeesError, r.employees.length > 0),
      count: r.employees.length || null,
      countLabel: 'people',
    },
    {
      key: 'competitors',
      label: 'Scan competitors',
      hint: 'Similar companies',
      status: status(
        r.competitorsLoading,
        r.competitorsError,
        !!r.competitors && r.competitors.length > 0,
      ),
      count: r.competitors?.length ?? null,
      countLabel: 'companies',
    },
    {
      key: 'signals',
      label: 'Web signals',
      hint: 'News · launches · customers',
      status: status(r.signalsLoading, r.signalsError, !!r.signals && r.signals.length > 0),
      count: r.signals?.length ?? null,
      countLabel: 'signals',
    },
    {
      key: 'jobs',
      label: 'Hiring activity',
      hint: 'Active job postings',
      status: status(r.jobsLoading, r.jobsError, !!r.jobs && r.jobs.length > 0),
      count: r.jobs?.length ?? null,
      countLabel: 'postings',
    },
  ];
}

type Status = 'idle' | 'searching' | 'ready' | 'error';

export default function Home() {
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<SearchError | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('employees');
  const [forcedDept, setForcedDept] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [view, setView] = useState<'graph' | 'summary' | 'table'>('summary');

  // Persist view choice; default to summary on all devices.
  useEffect(() => {
    const saved = localStorage.getItem('rolodex:view') as 'graph' | 'summary' | 'table' | null;
    if (saved === 'graph' || saved === 'summary' || saved === 'table') {
      setView(saved);
    }
  }, []);

  const switchView = useCallback((v: 'graph' | 'summary' | 'table') => {
    setView(v);
    localStorage.setItem('rolodex:view', v);
  }, []);

  const inFlight = useRef(false);
  const demoRef = useRef(false);

  // Free UI preview: `/?demo=1` loads a static fixture — no /api/search, no
  // credits. Reveals are stubbed below so clicking Enrich is free too.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!new URLSearchParams(window.location.search).has('demo')) return;
    demoRef.current = true;
    setInput(SAMPLE.domain);
    setReport({
      domain: SAMPLE.domain,
      inputEcho: SAMPLE.domain,
      resolvedFrom: null,
      company: SAMPLE.company,
      companyError: false,
      workforce: SAMPLE.workforce,
      workforceLoading: false,
      workforceError: false,
      competitors: SAMPLE.competitors,
      competitorsLoading: false,
      competitorsError: false,
      employees: SAMPLE.employees,
      employeesTotal: SAMPLE.employees.length,
      employeesLoading: false,
      employeesError: false,
      signals: null,
      signalsLoading: false,
      signalsError: false,
      jobs: null,
      jobsLoading: false,
      jobsError: false,
      cost: 0,
      durationMs: 0,
      emailFormat: [{ format: '{first}.{last}', percentage: 98 }],
    });
    setStatus('ready');
    setDone(true);
    // demo respects the same mobile-default logic as live searches
  }, []);

  const doSearch = useCallback(
    async (value: string) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setError(null);
      setDone(false);
      setForcedDept(null);
      setStatus('searching');
      setActiveTab('employees');
      setReport(freshReport(value));
      window.scrollTo({ top: 0, behavior: 'smooth' });

      try {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ input: value }),
        });

        if (!res.ok) {
          const err = (await res.json().catch(() => ({ error: 'server_error' }))) as SearchError;
          setError(err);
          setStatus('error');
          return;
        }

        let fatal = false;
        await readSearchStream(res, (msg) => {
          if (msg.type === 'fatal') {
            // Key limit hit mid-stream — abort the partial report to the error screen.
            fatal = true;
            setError({ error: msg.error });
            setStatus('error');
            return;
          }
          setReport((prev) => {
            const r = prev ?? freshReport(value);
            switch (msg.type) {
              case 'meta':
                return { ...r, domain: msg.domain, resolvedFrom: msg.resolvedFrom ?? null };
              case 'company':
                return { ...r, company: msg.data, companyError: !msg.data && !!msg.error };
              case 'workforce':
                return { ...r, workforce: msg.data, workforceLoading: false, workforceError: !msg.data && !!msg.error };
              case 'competitors':
                return { ...r, competitors: msg.data, competitorsLoading: false, competitorsError: !msg.data && !!msg.error };
              case 'employees':
                return {
                  ...r,
                  employees: msg.data,
                  employeesTotal: msg.totalAvailable,
                  employeesLoading: false,
                  employeesError: msg.data.length === 0 && !!msg.error,
                };
              case 'emailformat':
                return { ...r, emailFormat: msg.patterns };
              case 'signals':
                return { ...r, signals: msg.data, signalsLoading: false, signalsError: !msg.data && !!msg.error };
              case 'jobs':
                return { ...r, jobs: msg.data, jobsLoading: false, jobsError: !msg.data && !!msg.error };
              case 'narrative':
                // Apply only when the current description is short or absent.
                return r.company && (!r.company.description || r.company.description.length < 100)
                  ? { ...r, company: { ...r.company, description: msg.description } }
                  : r;
              case 'done':
                return {
                  ...r,
                  cost: msg.cost,
                  durationMs: msg.durationMs,
                  workforceLoading: false,
                  competitorsLoading: false,
                  employeesLoading: false,
                  signalsLoading: false,
                  jobsLoading: false,
                };
              default:
                return r;
            }
          });
        });
        if (!fatal) {
          // If the stream ended before the company message arrived (e.g. a
          // network cut or Vercel timeout), settle it as an error so the UI
          // shows "unavailable" instead of a loading skeleton forever.
          setReport((prev) => {
            if (!prev || prev.company || prev.companyError) return prev;
            return { ...prev, companyError: true };
          });
          setStatus('ready');
          setDone(true);
        }
      } catch {
        setError({ error: 'server_error' });
        setStatus('error');
      } finally {
        inFlight.current = false;
      }
    },
    [],
  );

  // Entry point for every search (typed input or competitor click).
  const requestSearch = useCallback(
    (value: string) => {
      const v = value.trim();
      if (!v || inFlight.current) return;

      // Client-side pre-check mirrors the server to avoid a wasted round-trip.
      const norm = normalizeInput(v);
      if (norm.kind === 'invalid') {
        setError({ error: 'invalid_domain', message: norm.reason });
        setStatus('error');
        return;
      }

      doSearch(v);
    },
    [doSearch],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    requestSearch(input);
  };

  const connectOrthogonal = () => {
    fetch('/api/track', { method: 'POST' }).catch(() => {});
    window.open('https://orthogonal.com', '_blank', 'noopener');
  };

  // On-demand email/phone reveal for one person (multi-source server-side).
  const revealContact = useCallback(
    async (payload: {
      ceId?: string | null;
      linkedin?: string | null;
      firstName?: string | null;
      lastName?: string | null;
    }): Promise<RevealResult> => {
      // Demo mode: never hit the paid reveal route.
      if (demoRef.current) {
        return {
          emails: [{ email: 'demo.contact@hyperion.demo', source: 'company-enrich' }],
          phone: '+1 555-0142',
        };
      }
      const res = await fetch('/api/reveal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          domain: report?.domain,
          ceId: payload.ceId ?? undefined,
          linkedin: payload.linkedin ?? undefined,
          firstName: payload.firstName ?? undefined,
          lastName: payload.lastName ?? undefined,
          organizationName: report?.company?.name ?? undefined,
        }),
      });
      if (!res.ok) throw new Error('reveal_failed');
      return (await res.json()) as RevealResult;
    },
    [report?.domain, report?.company?.name],
  );

  const reset = () => {
    setStatus('idle');
    setError(null);
    setReport(null);
  };

  const showReport = (status === 'searching' || status === 'ready') && report;
  // Full-bleed canvas for graph + loading screen. Summary gets its own full-width but scrollable layout.
  const graphFull = !!showReport && done && view === 'graph';
  const summaryFull = !!showReport && done && view === 'summary';

  return (
    <ToastProvider>
      {/* Dot-field background — dimmed in graph/loading view so the schematic
          canvas shows through without the field competing. */}
      <FieldBackground theme="blue" className={graphFull ? 'opacity-55' : ''} />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(130%_90%_at_50%_56%,transparent_0%,rgba(10,10,11,0.46)_60%,rgba(10,10,11,0.84)_100%)]"
      />

      {showReport && report && !done && (
        <LoadingScreen steps={buildTrace(report, false)} domain={report.domain} />
      )}

      <div className="min-h-screen flex flex-col">
        {/* Header — always translucent glass so the animated dot field shows through.
            Circuit-themed: subtle neon bottom trace. */}
        <header className="sticky top-0 z-30 bg-transparent">
          <div className={`${showReport ? 'px-6' : 'mx-auto max-w-6xl px-5'} h-[56px] flex items-center gap-4`}>
            {/* Left col: logo */}
            <div className="shrink-0">
              <button
                onClick={reset}
                className="font-display text-base tracking-tight flex items-center gap-2 text-cream"
              >
                <span style={{ color: '#22d3ee' }}>◇</span>
                <span className="hidden sm:inline">COMPANY ROLODEX</span>
              </button>
            </div>

            {/* Center col: search form (results only) */}
            <div className="flex-1 min-w-0 flex justify-center">
              {showReport && (
                <form onSubmit={onSubmit} className="w-full max-w-lg flex items-center gap-2">
                  <input
                    style={{
                      flex: 1,
                      background: 'rgba(8,11,20,0.8)',
                      border: '1px solid rgba(34,211,238,0.25)',
                      outline: 'none',
                      fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, monospace)',
                      fontSize: 12,
                      color: '#cfdcea',
                      letterSpacing: '0.04em',
                      padding: '6px 12px',
                      borderRadius: 2,
                      backdropFilter: 'blur(8px)',
                      minWidth: 0,
                    }}
                    placeholder="_ domain or company name"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    spellCheck={false}
                  />
                  <button
                    type="submit"
                    disabled={status === 'searching'}
                    style={{
                      position: 'relative',
                      padding: '6px 16px',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.18em',
                      cursor: status === 'searching' ? 'not-allowed' : 'pointer',
                      border: '1px solid #22d3ee',
                      background: 'rgba(34,211,238,0.1)',
                      backdropFilter: 'blur(8px)',
                      WebkitBackdropFilter: 'blur(8px)',
                      color: '#22d3ee',
                      boxShadow: '0 0 14px rgba(34,211,238,0.28), inset 0 0 8px rgba(34,211,238,0.04)',
                      fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, monospace)',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.2s',
                      opacity: status === 'searching' ? 0.5 : 1,
                      borderRadius: 2,
                      userSelect: 'none',
                    }}
                  >
                    <span style={{ position:'absolute', top:-1, left:-1, width:7, height:7, borderTop:'2px solid #22d3ee', borderLeft:'2px solid #22d3ee', pointerEvents:'none' }} />
                    <span style={{ position:'absolute', top:-1, right:-1, width:7, height:7, borderTop:'2px solid #22d3ee', borderRight:'2px solid #22d3ee', pointerEvents:'none' }} />
                    <span style={{ position:'absolute', bottom:-1, left:-1, width:7, height:7, borderBottom:'2px solid #22d3ee', borderLeft:'2px solid #22d3ee', pointerEvents:'none' }} />
                    <span style={{ position:'absolute', bottom:-1, right:-1, width:7, height:7, borderBottom:'2px solid #22d3ee', borderRight:'2px solid #22d3ee', pointerEvents:'none' }} />
                    {status === 'searching' ? 'SCANNING···' : 'RUN →'}
                  </button>
                </form>
              )}
            </div>

            {/* Right col: powered-by link (view toggle is the floating button) */}
            <div className="shrink-0 flex items-center gap-2 sm:gap-4">
              <a
                href="https://orthogonal.com"
                target="_blank"
                rel="noreferrer"
                onClick={() => fetch('/api/track', { method: 'POST' }).catch(() => {})}
                style={{
                  position: 'relative',
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '5px 12px',
                  fontSize: 10,
                  fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, monospace)',
                  fontWeight: 700,
                  letterSpacing: '0.18em',
                  color: 'rgba(34,211,238,0.55)',
                  border: '1px solid rgba(34,211,238,0.2)',
                  background: 'rgba(8,11,20,0.6)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  borderRadius: 2,
                  whiteSpace: 'nowrap' as const,
                  textDecoration: 'none',
                  transition: 'all 0.2s',
                }}
              >
                <span style={{ position:'absolute', top:-1, left:-1, width:6, height:6, borderTop:'1px solid rgba(34,211,238,0.5)', borderLeft:'1px solid rgba(34,211,238,0.5)', pointerEvents:'none' }} />
                <span style={{ position:'absolute', top:-1, right:-1, width:6, height:6, borderTop:'1px solid rgba(34,211,238,0.5)', borderRight:'1px solid rgba(34,211,238,0.5)', pointerEvents:'none' }} />
                <span style={{ position:'absolute', bottom:-1, left:-1, width:6, height:6, borderBottom:'1px solid rgba(34,211,238,0.5)', borderLeft:'1px solid rgba(34,211,238,0.5)', pointerEvents:'none' }} />
                <span style={{ position:'absolute', bottom:-1, right:-1, width:6, height:6, borderBottom:'1px solid rgba(34,211,238,0.5)', borderRight:'1px solid rgba(34,211,238,0.5)', pointerEvents:'none' }} />
                ORTHOGONAL.COM ↗
              </a>
            </div>
          </div>
        </header>

        <main
          className={
            graphFull ? 'w-full flex-1 flex flex-col'
            : summaryFull ? 'w-full flex-1'
            : 'mx-auto max-w-6xl w-full px-4 flex-1'
          }
        >
          {/* Search — landing only; in results it lives in the header bar */}
          {status === 'idle' && (
            <section className="text-center py-20 sm:py-28">
              <p className="hud mb-5 rise text-legible" style={{ color: 'rgba(34,211,238,0.7)', letterSpacing: '0.22em' }}>
                ◈ COMPANY INTELLIGENCE · ORTHOGONAL API
              </p>
              <h1 className="font-serif-hero text-[clamp(46px,8.6vw,104px)] text-cream max-w-[15ch] mx-auto mb-5 rise text-legible">
                Company <em style={{ color: '#22d3ee', fontStyle: 'italic' }}>Rolodex</em>
              </h1>
              <p className="rise text-legible mx-auto mb-10" style={{ fontFamily: 'var(--font-mono, ui-monospace)', fontSize: 11, color: 'rgba(74,127,165,0.85)', letterSpacing: '0.14em', maxWidth: 520 }}>
                PROFILE · FUNDING · TECH STACK · DEPARTMENTS · COMPETITORS · PEOPLE
              </p>

            <form
              onSubmit={onSubmit}
              style={{
                position: 'relative',
                maxWidth: 600,
                margin: '0 auto',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 6px 6px 18px',
                background: 'rgba(8,11,20,0.8)',
                border: '1px solid rgba(34,211,238,0.3)',
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                boxShadow: '0 0 24px rgba(34,211,238,0.08)',
                borderRadius: 3,
              }}
              className="rise"
            >
              <span style={{ position:'absolute', top:-1, left:-1, width:10, height:10, borderTop:'2px solid #22d3ee', borderLeft:'2px solid #22d3ee', pointerEvents:'none' }} />
              <span style={{ position:'absolute', top:-1, right:-1, width:10, height:10, borderTop:'2px solid #22d3ee', borderRight:'2px solid #22d3ee', pointerEvents:'none' }} />
              <span style={{ position:'absolute', bottom:-1, left:-1, width:10, height:10, borderBottom:'2px solid #22d3ee', borderLeft:'2px solid #22d3ee', pointerEvents:'none' }} />
              <span style={{ position:'absolute', bottom:-1, right:-1, width:10, height:10, borderBottom:'2px solid #22d3ee', borderRight:'2px solid #22d3ee', pointerEvents:'none' }} />
              <input
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, monospace)',
                  fontSize: 14,
                  color: '#cfdcea',
                  letterSpacing: '0.04em',
                  minWidth: 0,
                }}
                placeholder="_ domain or company name"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                autoFocus
                spellCheck={false}
              />
              <button
                type="submit"
                style={{
                  position: 'relative',
                  padding: '8px 20px',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.18em',
                  cursor: 'pointer',
                  border: '1px solid #22d3ee',
                  background: 'rgba(34,211,238,0.1)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  color: '#22d3ee',
                  boxShadow: '0 0 14px rgba(34,211,238,0.28)',
                  fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, monospace)',
                  whiteSpace: 'nowrap' as const,
                  transition: 'all 0.2s',
                  borderRadius: 2,
                  userSelect: 'none' as const,
                  flexShrink: 0,
                }}
              >
                <span style={{ position:'absolute', top:-1, left:-1, width:7, height:7, borderTop:'2px solid #22d3ee', borderLeft:'2px solid #22d3ee', pointerEvents:'none' }} />
                <span style={{ position:'absolute', top:-1, right:-1, width:7, height:7, borderTop:'2px solid #22d3ee', borderRight:'2px solid #22d3ee', pointerEvents:'none' }} />
                <span style={{ position:'absolute', bottom:-1, left:-1, width:7, height:7, borderBottom:'2px solid #22d3ee', borderLeft:'2px solid #22d3ee', pointerEvents:'none' }} />
                <span style={{ position:'absolute', bottom:-1, right:-1, width:7, height:7, borderBottom:'2px solid #22d3ee', borderRight:'2px solid #22d3ee', pointerEvents:'none' }} />
                RUN REPORT →
              </button>
            </form>

          </section>
          )}

          {/* Error */}
          {status === 'error' && error && <ErrorScreen error={error} onReset={reset} />}

          {/* Report — graph, summary, or table view */}
          {showReport &&
            report &&
            done &&
            (view === 'graph' ? (
              <div className="relative flex-1 min-h-[calc(100dvh-56px)] bg-transparent">
                <CircuitGraph
                  data={{
                    domain: report.domain,
                    company: report.company,
                    competitors: report.competitors,
                    competitorsLoading: report.competitorsLoading,
                    workforce: report.workforce,
                    workforceLoading: report.workforceLoading,
                    employees: report.employees,
                    employeesTotal: report.employeesTotal,
                  }}
                  onReveal={revealContact}
                  onSearchCompany={(d) => requestSearch(d)}
                  onSwitchToTable={() => switchView('summary')}
                />
              </div>
            ) : view === 'summary' ? (
              <section className="w-full">
                <SummaryView
                  data={{
                    domain: report.domain,
                    company: report.company,
                    companyError: report.companyError,
                    workforce: report.workforce,
                    workforceLoading: report.workforceLoading,
                    competitors: report.competitors,
                    competitorsLoading: report.competitorsLoading,
                    employees: report.employees,
                    employeesTotal: report.employeesTotal,
                    employeesLoading: report.employeesLoading,
                    signals: report.signals,
                    signalsLoading: report.signalsLoading,
                  }}
                  onReveal={revealContact}
                  onSearchCompany={(d) => requestSearch(d)}
                />
              </section>
            ) : (
              <section className="w-full pb-10">
                <div className="font-mono text-[0.66rem] text-muted mb-3">
                  ${report.cost.toFixed(2)} · {(report.durationMs / 1000).toFixed(1)}s
                  {report.resolvedFrom ? ` · ${report.resolvedFrom} → ${report.domain}` : ''}
                </div>
              {report.company ? (
                <CompanyCard company={report.company} />
              ) : report.companyError ? (
                <div className="retro-panel-flat p-6 my-4 text-center text-slate">
                  Company profile unavailable for <b>{report.domain}</b>.
                </div>
              ) : (
                <CompanyCardSkeleton domain={report.domain} />
              )}

              <Tabs
                active={activeTab}
                onChange={setActiveTab}
                tabs={[
                  { id: 'employees', label: 'Employees', count: report.employees.length || null },
                  { id: 'signals', label: 'Signals', count: report.signals?.length ?? null },
                  { id: 'departments', label: 'Workforce & Hiring', count: report.workforce?.departments.length ?? null },
                  { id: 'competitors', label: 'Competitors', count: report.competitors?.length ?? null },
                ]}
              />

              <div className="retro-panel p-4 rounded-t-none">
                {activeTab === 'employees' && (
                  <EmployeesTab
                    employees={report.employees}
                    totalAvailable={report.employeesTotal}
                    loading={report.employeesLoading}
                    forcedDepartment={forcedDept}
                    onReveal={revealContact}
                    onConnectClick={connectOrthogonal}
                    error={report.employeesError}
                    onRetry={() => requestSearch(report.domain)}
                    emailFormat={report.emailFormat}
                    domain={report.domain}
                  />
                )}
                {activeTab === 'signals' && (
                  <SignalsTab
                    signals={report.signals}
                    loading={report.signalsLoading}
                    error={report.signalsError}
                  />
                )}
                {activeTab === 'departments' && (
                  <DepartmentsTab
                    workforce={report.workforce}
                    jobs={report.jobs}
                    onPickDepartment={(d) => {
                      setForcedDept(d);
                      setActiveTab('employees');
                    }}
                    error={report.workforceError}
                    onRetry={() => requestSearch(report.domain)}
                  />
                )}
                {activeTab === 'competitors' && (
                  <CompetitorsTab
                    competitors={report.competitors}
                    onSearch={(d) => requestSearch(d)}
                    error={report.competitorsError}
                    onRetry={() => requestSearch(report.domain)}
                  />
                )}
              </div>
              </section>
            ))}
        </main>

        <Footer />
      </div>

      {/* ── Floating view toggle — fixed bottom-right, visible when report is ready ── */}
      {showReport && done && (
        <button
          onClick={() => switchView(view === 'graph' ? 'summary' : 'graph')}
          className="fixed bottom-6 right-4 z-40 font-mono text-[0.7rem] tracking-[0.16em] px-4 py-2.5 bg-black/80 backdrop-blur-sm transition-all active:scale-95"
          style={{
            border: `1px solid ${view === 'graph' ? CIRCUIT_COLOR.departments : CIRCUIT_COLOR.employees}`,
            color: view === 'graph' ? CIRCUIT_COLOR.departments : CIRCUIT_COLOR.employees,
            boxShadow: `0 0 18px ${view === 'graph' ? CIRCUIT_COLOR.departments : CIRCUIT_COLOR.employees}28, 0 4px 16px rgba(0,0,0,0.5)`,
          }}
        >
          {view === 'graph' ? '◊ SUMMARY VIEW' : '◈ GRAPH VIEW'}
        </button>
      )}
    </ToastProvider>
  );
}
