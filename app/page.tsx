'use client';

import { useCallback, useRef, useState } from 'react';
import Turnstile from 'react-turnstile';
import { readSearchStream } from '@/lib/stream';
import { normalizeInput } from '@/lib/normalize';
import type {
  Company,
  Competitor,
  Counts,
  Employee,
  LocationCount,
  SearchError,
} from '@/lib/types';
import { ToastProvider } from '@/components/Toast';
import CompanyCard, { CompanyCardSkeleton } from '@/components/CompanyCard';
import DataQualityBanner from '@/components/DataQualityBanner';
import Tabs, { type TabId } from '@/components/Tabs';
import EmployeesTab from '@/components/EmployeesTab';
import DepartmentsTab from '@/components/DepartmentsTab';
import LocationsTab from '@/components/LocationsTab';
import CompetitorsTab from '@/components/CompetitorsTab';
import ErrorScreen from '@/components/ErrorScreen';
import Footer from '@/components/Footer';

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const EXAMPLES = ['stripe.com', 'brattle.com', 'notion.so', 'figma.com'];

interface Report {
  domain: string;
  inputEcho: string;
  resolvedFrom: string | null;
  cached: { company: boolean; employees: boolean };
  company: Company | null;
  companyError: boolean;
  counts: Counts | null;
  countsLoading: boolean;
  competitors: Competitor[] | null;
  competitorsLoading: boolean;
  locations: LocationCount[] | null;
  locationsLoading: boolean;
  employees: Employee[];
  employeesTotal: number;
  employeesLoading: boolean;
  cost: number;
  durationMs: number;
}

function freshReport(inputEcho: string): Report {
  return {
    domain: inputEcho,
    inputEcho,
    resolvedFrom: null,
    cached: { company: false, employees: false },
    company: null,
    companyError: false,
    counts: null,
    countsLoading: true,
    competitors: null,
    competitorsLoading: true,
    locations: null,
    locationsLoading: true,
    employees: [],
    employeesTotal: 0,
    employeesLoading: true,
    cost: 0,
    durationMs: 0,
  };
}

type Status = 'idle' | 'searching' | 'ready' | 'error';

export default function Home() {
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<SearchError | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('employees');
  const [forcedDept, setForcedDept] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [done, setDone] = useState(false);

  // Turnstile: fetch a fresh single-use token per search by remounting.
  const [widgetKey, setWidgetKey] = useState(0);
  const pending = useRef<{ value: string; refresh: boolean } | null>(null);
  const inFlight = useRef(false);

  const doSearch = useCallback(
    async (value: string, refresh: boolean, token: string | undefined) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setError(null);
      setDone(false);
      setForcedDept(null);
      if (refresh) setRefreshing(true);
      else {
        setStatus('searching');
        setActiveTab('employees');
        setReport(freshReport(value));
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      try {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ input: value, turnstileToken: token, refresh }),
        });

        if (!res.ok) {
          const err = (await res.json().catch(() => ({ error: 'server_error' }))) as SearchError;
          setError(err);
          setStatus('error');
          return;
        }

        await readSearchStream(res, (msg) => {
          setReport((prev) => {
            const r = prev ?? freshReport(value);
            switch (msg.type) {
              case 'meta':
                return { ...r, domain: msg.domain, resolvedFrom: msg.resolvedFrom ?? null, cached: msg.cached };
              case 'company':
                return { ...r, company: msg.data, companyError: !msg.data && !!msg.error };
              case 'counts':
                return { ...r, counts: msg.data, countsLoading: false };
              case 'competitors':
                return { ...r, competitors: msg.data, competitorsLoading: false };
              case 'locations':
                return { ...r, locations: msg.data, locationsLoading: false };
              case 'employees':
                return { ...r, employees: msg.data, employeesTotal: msg.totalAvailable, employeesLoading: false };
              case 'done':
                return {
                  ...r,
                  cost: msg.cost,
                  durationMs: msg.durationMs,
                  countsLoading: false,
                  competitorsLoading: false,
                  locationsLoading: false,
                  employeesLoading: false,
                };
              default:
                return r;
            }
          });
        });
        setStatus('ready');
        setDone(true);
      } catch {
        setError({ error: 'server_error' });
        setStatus('error');
      } finally {
        inFlight.current = false;
        setRefreshing(false);
      }
    },
    [],
  );

  // Entry point for every search (typed, competitor click, refresh).
  const requestSearch = useCallback(
    (value: string, refresh = false) => {
      const v = value.trim();
      if (!v || inFlight.current) return;

      // Client-side pre-check mirrors the server to avoid burning a token.
      if (!refresh) {
        const norm = normalizeInput(v);
        if (norm.kind === 'invalid') {
          setError({ error: 'invalid_domain', message: norm.reason });
          setStatus('error');
          return;
        }
      }

      if (SITE_KEY) {
        pending.current = { value: v, refresh };
        setWidgetKey((k) => k + 1); // remount → onVerify fires with a fresh token
      } else {
        doSearch(v, refresh, undefined);
      }
    },
    [doSearch],
  );

  const onTurnstileVerify = useCallback(
    (token: string) => {
      const p = pending.current;
      if (p) {
        pending.current = null;
        doSearch(p.value, p.refresh, token);
      }
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

  const reset = () => {
    setStatus('idle');
    setError(null);
    setReport(null);
  };

  const showReport = (status === 'searching' || status === 'ready') && report;

  return (
    <ToastProvider>
      <div className="min-h-screen flex flex-col">
        {/* Header */}
        <header className="border-b-4 border-ink bg-neon">
          <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
            <button onClick={reset} className="font-display text-2xl sm:text-3xl flex items-center gap-2">
              <span className="text-signal">▤</span> COMPANY INTEL
            </button>
            <a
              href="https://orthogonal.com"
              target="_blank"
              rel="noreferrer"
              onClick={() => fetch('/api/track', { method: 'POST' }).catch(() => {})}
              className="font-display text-sm sm:text-base bg-ink text-neon px-3 py-1.5 rounded border-2 border-ink hover:bg-cobalt-deep transition-colors"
            >
              POWERED BY ORTHOGONAL ↗
            </a>
          </div>
        </header>

        <main className="mx-auto max-w-6xl w-full px-4 flex-1">
          {/* Search */}
          <section className={`text-center ${status === 'idle' ? 'py-16 sm:py-24' : 'py-6'}`}>
            {status === 'idle' && (
              <>
                <h1 className="font-display text-5xl sm:text-7xl text-white drop-shadow-[3px_3px_0_#0b1220] mb-3">
                  COMPANY <span className="text-neon">INTEL</span>
                </h1>
                <p className="text-white/90 max-w-xl mx-auto mb-8">
                  Type a company domain or name. Get an instant intelligence report — profile,
                  departments, locations, competitors, and people. Powered by orthogonal.com.
                </p>
              </>
            )}

            <form onSubmit={onSubmit} className="retro-panel p-3 sm:p-4 max-w-2xl mx-auto flex flex-col sm:flex-row gap-3">
              <input
                className="retro-input"
                placeholder="brattle.com  or  Stripe"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                autoFocus
                spellCheck={false}
              />
              <button type="submit" className="retro-btn whitespace-nowrap" disabled={status === 'searching'}>
                {status === 'searching' ? 'Scanning…' : '► Run Report'}
              </button>
            </form>

            {status === 'idle' && (
              <div className="mt-4 flex flex-wrap gap-2 justify-center">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => {
                      setInput(ex);
                      requestSearch(ex);
                    }}
                    className="retro-btn retro-btn-sm retro-btn-blue"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            )}

            {SITE_KEY && (
              <div className="mt-3 flex justify-center">
                <Turnstile key={widgetKey} sitekey={SITE_KEY} onVerify={onTurnstileVerify} theme="light" />
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
                  {report.cached.company || report.cached.employees
                    ? '⚡ Served from cache'
                    : `Fresh report · $${report.cost.toFixed(2)} · ${(report.durationMs / 1000).toFixed(1)}s`}
                </div>
              )}

              {report.company ? (
                <CompanyCard
                  company={report.company}
                  refreshing={refreshing}
                  onRefresh={() => requestSearch(report.domain, true)}
                />
              ) : report.companyError ? (
                <div className="retro-panel-flat p-6 my-4 text-center text-slate">
                  Company profile unavailable for <b>{report.domain}</b>.
                </div>
              ) : (
                <CompanyCardSkeleton domain={report.domain} />
              )}

              {report.company?.acceptAll && <DataQualityBanner />}

              <Tabs
                active={activeTab}
                onChange={setActiveTab}
                tabs={[
                  { id: 'employees', label: 'Employees', count: report.employeesTotal || report.employees.length || null },
                  { id: 'departments', label: 'Departments', count: report.counts?.departments.length ?? null },
                  { id: 'locations', label: 'Locations', count: report.locations?.length ?? null },
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
                    onConnectClick={connectOrthogonal}
                  />
                )}
                {activeTab === 'departments' && (
                  <DepartmentsTab
                    counts={report.counts}
                    onPickDepartment={(d) => {
                      setForcedDept(d);
                      setActiveTab('employees');
                    }}
                  />
                )}
                {activeTab === 'locations' && <LocationsTab locations={report.locations} />}
                {activeTab === 'competitors' && (
                  <CompetitorsTab competitors={report.competitors} onSearch={(d) => requestSearch(d)} />
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
