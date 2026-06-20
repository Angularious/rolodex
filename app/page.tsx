'use client';

import { useCallback, useRef, useState } from 'react';
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
import OrchestrationTrace, { type TraceStep } from '@/components/OrchestrationTrace';
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

  const inFlight = useRef(false);

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

  return (
    <ToastProvider>
      {/* Animated dot-field background + legibility scrim */}
      <FieldBackground />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(130%_90%_at_50%_56%,transparent_0%,rgba(10,10,11,0.46)_60%,rgba(10,10,11,0.84)_100%)]"
      />

      <div className="min-h-screen flex flex-col">
        {/* Header */}
        <header className="sticky top-0 z-30 border-b border-line bg-ink/70 backdrop-blur-md">
          <div className="mx-auto max-w-6xl px-5 h-[54px] flex items-center justify-between">
            <button
              onClick={reset}
              className="font-display text-base sm:text-lg tracking-tight flex items-center gap-2 text-cream"
            >
              <span className="text-accent">◇</span> COMPANY ROLODEX
            </button>
            <a
              href="https://orthogonal.com"
              target="_blank"
              rel="noreferrer"
              onClick={() => fetch('/api/track', { method: 'POST' }).catch(() => {})}
              className="font-mono text-[0.7rem] uppercase tracking-[0.18em] rounded-full border border-line px-3 py-1.5 text-cream-dim hover:text-cream hover:border-cream-dim transition-colors"
            >
              Powered by orthogonal.com ↗
            </a>
          </div>
        </header>

        <main className="mx-auto max-w-6xl w-full px-4 flex-1">
          {/* Search */}
          <section className={`text-center ${status === 'idle' ? 'py-20 sm:py-28' : 'py-8'}`}>
            {status === 'idle' && (
              <>
                <p className="hud mb-6 rise text-legible">Company intelligence · powered by Orthogonal</p>
                <h1 className="font-serif-hero text-[clamp(46px,8.6vw,104px)] text-cream max-w-[15ch] mx-auto mb-6 rise text-legible">
                  Company <em>Rolodex</em>
                </h1>
                <p className="text-cream-dim text-base sm:text-lg max-w-xl mx-auto mb-10 rise text-legible">
                  Type a company domain or name. Get an instant intelligence report — profile,
                  departments, locations, competitors, and people.
                </p>
              </>
            )}

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
              <button
                type="submit"
                className="retro-btn retro-btn-blue whitespace-nowrap"
                disabled={status === 'searching'}
              >
                {status === 'searching' ? 'Scanning…' : 'Run report →'}
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

          {/* Error */}
          {status === 'error' && error && <ErrorScreen error={error} onReset={reset} />}

          {/* Report */}
          {showReport && report && (
            <section>
              {report.resolvedFrom && (
                <div className="text-white/90 text-sm mb-1">
                  Resolved <b>{report.resolvedFrom}</b> → <b>{report.domain}</b>
                </div>
              )}
              {done && (
                <div className="text-white/80 text-xs mb-2">
                  Live report · ${report.cost.toFixed(2)} · {(report.durationMs / 1000).toFixed(1)}s
                </div>
              )}

              <OrchestrationTrace
                steps={buildTrace(report, done)}
                done={done}
                durationMs={report.durationMs}
              />

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
                    domain={report.domain}
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
                    domain={report.domain}
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
          )}
        </main>

        <Footer />
      </div>
    </ToastProvider>
  );
}
