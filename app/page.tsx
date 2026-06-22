'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { readSearchStream } from '@/lib/stream';
import { normalizeInput } from '@/lib/normalize';
import type {
  Company,
  Competitor,
  Workforce,
  Employee,
  DecisionMaker,
  RevealResult,
  SearchError,
} from '@/lib/types';
import { ToastProvider } from '@/components/Toast';
import CompanyCard, { CompanyCardSkeleton } from '@/components/CompanyCard';
import Tabs, { type TabId } from '@/components/Tabs';
import EmployeesTab from '@/components/EmployeesTab';
import DecisionMakersTab from '@/components/DecisionMakersTab';
import DepartmentsTab from '@/components/DepartmentsTab';
import CompetitorsTab from '@/components/CompetitorsTab';
import dynamic from 'next/dynamic';
import { type TraceStep } from '@/components/OrchestrationTrace';
import LoadingScreen from '@/components/graph/LoadingScreen';
import { SAMPLE } from '@/components/graph/sample';

// Circuit-schematic drill-down view — client-only (SVG-heavy, no SSR needed).
const CircuitGraph = dynamic(() => import('@/components/circuit/CircuitGraph'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full grid place-items-center bg-black font-mono text-xs text-[#5b6b82]">
      initializing schematic…
    </div>
  ),
});
import ErrorScreen from '@/components/ErrorScreen';
import Footer from '@/components/Footer';
import FieldBackground from '@/components/FieldBackground';

const EXAMPLES = ['stripe.com', 'google.com', 'spacex.com', 'figma.com'];

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
  decisionMakers: DecisionMaker[] | null;
  decisionMakersLoading: boolean;
  decisionMakersError: boolean;
  cost: number;
  durationMs: number;
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
    decisionMakers: null,
    decisionMakersLoading: true,
    decisionMakersError: false,
    cost: 0,
    durationMs: 0,
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
      count: r.employeesTotal || r.employees.length || null,
      countLabel: 'people',
    },
    {
      key: 'decisionmakers',
      label: 'Surface decision-makers',
      hint: 'Senior contacts + coverage',
      status: status(
        r.decisionMakersLoading,
        r.decisionMakersError,
        !!r.decisionMakers && r.decisionMakers.length > 0,
      ),
      count: r.decisionMakers?.length ?? null,
      countLabel: 'contacts',
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
  const [view, setView] = useState<'graph' | 'table'>('graph');

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
      decisionMakers: SAMPLE.decisionMakers,
      decisionMakersLoading: false,
      decisionMakersError: false,
      cost: 0,
      durationMs: 0,
    });
    setStatus('ready');
    setDone(true);
    setView('graph');
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
              case 'decisionmakers':
                return { ...r, decisionMakers: msg.data, decisionMakersLoading: false, decisionMakersError: !msg.data && !!msg.error };
              case 'done':
                return {
                  ...r,
                  cost: msg.cost,
                  durationMs: msg.durationMs,
                  workforceLoading: false,
                  competitorsLoading: false,
                  employeesLoading: false,
                  decisionMakersLoading: false,
                };
              default:
                return r;
            }
          });
        });
        if (!fatal) {
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

  // On-demand email/phone reveal for one person (tiered server-side).
  const revealContact = useCallback(
    async (payload: { ceId?: string | null; linkedin?: string | null }): Promise<RevealResult> => {
      // Demo mode: never hit the paid reveal route.
      if (demoRef.current) {
        return { email: 'demo.contact@hyperion.demo', phone: '+1 555-0142', source: 'company-enrich' };
      }
      const res = await fetch('/api/reveal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          domain: report?.domain,
          ceId: payload.ceId ?? undefined,
          linkedin: payload.linkedin ?? undefined,
        }),
      });
      if (!res.ok) throw new Error('reveal_failed');
      return (await res.json()) as RevealResult;
    },
    [report?.domain],
  );

  const reset = () => {
    setStatus('idle');
    setError(null);
    setReport(null);
  };

  const showReport = (status === 'searching' || status === 'ready') && report;
  // Full-bleed, dot-field-free chrome for the graph AND the loading screen
  // (loading always uses the space canvas, regardless of the chosen view).
  const graphFull = !!showReport && (view === 'graph' || !done);

  return (
    <ToastProvider>
      {/* Dot-field background — dimmed in graph/loading view so the schematic
          canvas shows through without the field competing. */}
      <FieldBackground theme="blue" className={graphFull ? 'opacity-30' : ''} />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(130%_90%_at_50%_56%,transparent_0%,rgba(10,10,11,0.46)_60%,rgba(10,10,11,0.84)_100%)]"
      />

      <div className="min-h-screen flex flex-col">
        {/* Header — minimal single line; in results it carries the search + toggle.
            Transparent over the graph so the bar reads as part of the scene. */}
        <header
          className={`sticky top-0 z-30 ${
            graphFull ? 'bg-transparent' : 'border-b border-line bg-ink/70 backdrop-blur-md'
          }`}
        >
          <div className={`${showReport ? 'px-6' : 'mx-auto max-w-6xl px-5'} h-[56px] flex items-center gap-4`}>
            {/* Left col: logo */}
            <div className="shrink-0">
              <button
                onClick={reset}
                className="font-display text-base tracking-tight flex items-center gap-2 text-cream"
              >
                <span className="text-accent">◇</span>
                <span className="hidden sm:inline">COMPANY ROLODEX</span>
              </button>
            </div>

            {/* Center col: search form (results only) */}
            <div className="flex-1 min-w-0 flex justify-center">
              {showReport && (
                <form onSubmit={onSubmit} className="w-full max-w-lg flex items-center gap-2">
                  <input
                    className="retro-input border-line bg-card py-1.5 text-sm focus:shadow-none"
                    placeholder="company domain or name"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    spellCheck={false}
                  />
                  <button
                    type="submit"
                    disabled={status === 'searching'}
                    className="retro-btn retro-btn-blue retro-btn-sm whitespace-nowrap"
                  >
                    {status === 'searching' ? 'Scanning…' : 'Run →'}
                  </button>
                </form>
              )}
            </div>

            {/* Right col: graph/table toggles + powered-by link */}
            <div className="shrink-0 flex items-center gap-3 sm:gap-4">
              {showReport && done && (
                <>
                  <button
                    onClick={() => setView('graph')}
                    className={`font-mono text-sm tracking-wide transition-colors ${
                      view === 'graph' ? 'text-accent-soft' : 'text-cream-dim hover:text-cream'
                    }`}
                  >
                    ◈ Graph
                  </button>
                  <button
                    onClick={() => setView('table')}
                    className={`font-mono text-sm tracking-wide transition-colors ${
                      view === 'table' ? 'text-accent-soft' : 'text-cream-dim hover:text-cream'
                    }`}
                  >
                    ▦ Table
                  </button>
                </>
              )}
              <a
                href="https://orthogonal.com"
                target="_blank"
                rel="noreferrer"
                onClick={() => fetch('/api/track', { method: 'POST' }).catch(() => {})}
                className={`${!showReport ? 'ml-auto' : ''} font-mono text-[0.62rem] uppercase tracking-[0.16em] rounded-full border border-line px-2.5 py-1 text-cream-dim hover:text-cream hover:border-cream-dim transition-colors whitespace-nowrap`}
              >
                <span className="hidden md:inline">Powered by </span>orthogonal.com ↗
              </a>
            </div>
          </div>
        </header>

        <main
          className={
            graphFull ? 'w-full flex-1 flex flex-col' : 'mx-auto max-w-6xl w-full px-4 flex-1'
          }
        >
          {/* Search — landing only; in results it lives in the header bar */}
          {status === 'idle' && (
            <section className="text-center py-20 sm:py-28">
              <p className="hud mb-6 rise text-legible">Company intelligence · powered by Orthogonal</p>
              <h1 className="font-serif-hero text-[clamp(46px,8.6vw,104px)] text-cream max-w-[15ch] mx-auto mb-6 rise text-legible">
                Company <em>Rolodex</em>
              </h1>
              <p className="text-cream-dim text-base sm:text-lg max-w-xl mx-auto mb-10 rise text-legible">
                Type a company domain or name. Get an instant intelligence report — profile,
                departments, locations, competitors, and people.
              </p>

            <form
              onSubmit={onSubmit}
              className="retro-panel p-2 max-w-2xl mx-auto flex flex-col sm:flex-row gap-2 rise"
            >
              <input
                className="retro-input border-transparent bg-transparent focus:shadow-none"
                placeholder="google.com  or  SpaceX"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                autoFocus
                spellCheck={false}
              />
              <button type="submit" className="retro-btn retro-btn-blue whitespace-nowrap">
                Run report →
              </button>
            </form>

            {status === 'idle' && (
              <div className="mt-5 flex flex-wrap gap-2 justify-center items-center rise">
                <span className="hud mr-1">Try</span>
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => {
                      setInput(ex);
                      requestSearch(ex);
                    }}
                    className="retro-btn retro-btn-ghost retro-btn-sm font-mono"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            )}
          </section>
          )}

          {/* Error */}
          {status === 'error' && error && <ErrorScreen error={error} onReset={reset} />}

          {/* Report — loading screen, then full-bleed graph or the table view */}
          {showReport &&
            report &&
            (!done ? (
              <div className="flex-1 relative">
                <LoadingScreen steps={buildTrace(report, false)} domain={report.domain} />
              </div>
            ) : view === 'graph' ? (
              <div className="relative flex-1 min-h-[70vh] bg-black">
                <CircuitGraph
                  data={{
                    domain: report.domain,
                    company: report.company,
                    competitors: report.competitors,
                    competitorsLoading: report.competitorsLoading,
                    decisionMakers: report.decisionMakers,
                    decisionMakersLoading: report.decisionMakersLoading,
                    workforce: report.workforce,
                    workforceLoading: report.workforceLoading,
                    employees: report.employees,
                    employeesTotal: report.employeesTotal,
                  }}
                  onReveal={revealContact}
                  onSearchCompany={(d) => requestSearch(d)}
                  onSwitchToTable={() => setView('table')}
                />
              </div>
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
                  { id: 'employees', label: 'Employees', count: report.employeesTotal || report.employees.length || null },
                  { id: 'decisionmakers', label: 'Decision-makers', count: report.decisionMakers?.length ?? null },
                  { id: 'departments', label: 'Departments', count: report.workforce?.departments.length ?? null },
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
                  />
                )}
                {activeTab === 'decisionmakers' && (
                  <DecisionMakersTab
                    decisionMakers={report.decisionMakers}
                    loading={report.decisionMakersLoading}
                    onReveal={revealContact}
                    error={report.decisionMakersError}
                    onRetry={() => requestSearch(report.domain)}
                  />
                )}
                {activeTab === 'departments' && (
                  <DepartmentsTab
                    workforce={report.workforce}
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
    </ToastProvider>
  );
}
