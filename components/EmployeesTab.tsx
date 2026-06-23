'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Employee, EmailHit, FormatPattern, RevealResult } from '@/lib/types';
import { applyEmailFormat } from '@/lib/email';
import { countryName } from '@/lib/format';
import { useToast } from './Toast';
import { SectionError } from './DepartmentsTab';
import { Avatar } from './DecisionMakersTab';

function tenureLabel(startedAt?: string | null): string | null {
  if (!startedAt) return null;
  const year = startedAt.slice(0, 4);
  return /^\d{4}$/.test(year) ? `Since ${year}` : null;
}

type SortKey = 'name' | 'seniority' | 'department';

const SENIORITY_RANK: Record<string, number> = {
  founder: 0,
  owner: 0,
  'c-suite': 1,
  cxo: 1,
  partner: 2,
  vp: 3,
  director: 4,
  head: 5,
  principal: 6,
  senior: 7,
  manager: 8,
  mid: 9,
  entry: 10,
  junior: 10,
};

// Provider-agnostic display labels (CLAUDE.md: no provider names in UI).
const SOURCE_LABEL: Record<EmailHit['source'], string> = {
  'company-enrich': 'verified',
  'apollo': 'likely',
  'contactout': 'likely',
};

// Confidence badge per employee row (source → capability label, no provider names).
const CONFIDENCE: Record<NonNullable<Employee['source']>, { label: string; cls: string }> = {
  'company-enrich': { label: 'verified', cls: 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10' },
  'contactout':     { label: 'enriched', cls: 'text-sky-400 border-sky-400/40 bg-sky-400/10' },
  'tomba':          { label: 'pattern',  cls: 'text-amber-400 border-amber-400/40 bg-amber-400/10' },
};

function ConfidenceBadge({ source }: { source?: Employee['source'] }) {
  if (!source) return null;
  const c = CONFIDENCE[source];
  if (!c) return null;
  return (
    <span className={`inline-block text-[0.55rem] uppercase tracking-wide border rounded px-1 py-px font-bold ${c.cls}`}>
      {c.label}
    </span>
  );
}

export type RevealFn = (payload: {
  ceId?: string | null;
  linkedin?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}) => Promise<RevealResult>;

interface RevealState {
  loading: boolean;
  tried: boolean;
  emails: EmailHit[];
  phone: string | null;
}

function rowKey(e: Employee): string {
  return e.ceId || e.linkedin || e.fullName;
}

/** Human-readable format pattern, e.g. "{first}.{last}@bcg.com" → "first.last@bcg.com" */
function formatExample(format: string, domain: string): string {
  return (
    format
      .replace('{first}', 'first')
      .replace('{last}', 'last')
      .replace('{f}', 'f')
      .replace('{l}', 'l') +
    '@' +
    domain
  );
}

export function EmployeesSkeleton() {
  return (
    <div className="pop-in">
      <div className="loader-bar w-full mb-4" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skeleton h-9 mb-2" />
      ))}
    </div>
  );
}

export default function EmployeesTab({
  employees,
  totalAvailable,
  loading,
  forcedDepartment,
  onReveal,
  onConnectClick,
  error,
  onRetry,
  emailFormat = [],
  domain = '',
}: {
  employees: Employee[];
  totalAvailable: number;
  loading: boolean;
  forcedDepartment: string | null;
  onReveal: RevealFn;
  onConnectClick: () => void;
  error?: boolean;
  onRetry?: () => void;
  emailFormat?: FormatPattern[];
  domain?: string;
}) {
  const toast = useToast();
  const [dept, setDept] = useState('');
  const [seniority, setSeniority] = useState('');
  const [country, setCountry] = useState('');
  const [hasLinkedIn, setHasLinkedIn] = useState(false);
  const [sort, setSort] = useState<SortKey>('seniority');
  const [revealed, setRevealed] = useState<Record<string, RevealState>>({});

  useEffect(() => {
    if (forcedDepartment) setDept(forcedDepartment);
  }, [forcedDepartment]);

  const departments = useMemo(
    () => Array.from(new Set(employees.map((e) => e.department).filter(Boolean))).sort() as string[],
    [employees],
  );
  const seniorities = useMemo(
    () => Array.from(new Set(employees.map((e) => e.seniority).filter(Boolean))).sort() as string[],
    [employees],
  );
  const countries = useMemo(
    () => Array.from(new Set(employees.map((e) => e.country).filter(Boolean))).sort() as string[],
    [employees],
  );

  const filtered = useMemo(() => {
    const list = employees.filter((e) => {
      if (dept && e.department !== dept) return false;
      if (seniority && e.seniority !== seniority) return false;
      if (country && e.country !== country) return false;
      if (hasLinkedIn && !e.linkedin) return false;
      return true;
    });
    list.sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.fullName.localeCompare(b.fullName);
        case 'department':
          return (a.department || 'zzz').localeCompare(b.department || 'zzz');
        default:
          return (
            (SENIORITY_RANK[(a.seniority ?? '').toLowerCase()] ?? 99) -
            (SENIORITY_RANK[(b.seniority ?? '').toLowerCase()] ?? 99)
          );
      }
    });
    return list;
  }, [employees, dept, seniority, country, hasLinkedIn, sort]);

  const reveal = async (e: Employee) => {
    const key = rowKey(e);
    if (revealed[key]?.loading || revealed[key]?.tried) return;
    setRevealed((r) => ({ ...r, [key]: { loading: true, tried: false, emails: [], phone: null } }));
    try {
      const res = await onReveal({ ceId: e.ceId, linkedin: e.linkedin, firstName: e.firstName, lastName: e.lastName });
      setRevealed((r) => ({
        ...r,
        [key]: { loading: false, tried: true, emails: res.emails, phone: res.phone },
      }));
      if (res.emails.length || res.phone) toast(`Revealed contact`);
      else toast('No contact found');
    } catch {
      setRevealed((r) => ({ ...r, [key]: { loading: false, tried: true, emails: [], phone: null } }));
      toast('Reveal failed');
    }
  };

  const copyText = (text: string | null) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => toast(`Copied ${text}`));
  };

  const copyAllEmails = () => {
    const emails = filtered
      .map((e) => {
        const st = revealed[rowKey(e)];
        return st?.emails[0]?.email ?? (e.email ?? null);
      })
      .filter(Boolean)
      .join(', ');
    if (!emails) return toast('Reveal some emails first');
    navigator.clipboard.writeText(emails as string).then(() => toast('Copied emails'));
  };

  // The dominant email format pattern (highest percentage).
  const dominantPattern = emailFormat[0] ?? null;

  const EmailCell = ({ e }: { e: Employee }) => {
    const st = revealed[rowKey(e)];

    // Post-reveal: show all found emails + phone.
    if (st?.tried) {
      if (!st.emails.length && !st.phone)
        return <span className="text-slate text-xs">not found</span>;
      return (
        <div className="flex flex-col gap-1 items-start">
          {st.emails.map((h) => (
            <div key={h.email} className="flex flex-col gap-0">
              <button
                onClick={() => copyText(h.email)}
                className="text-accent-soft underline break-all text-left leading-tight"
              >
                {h.email}
              </button>
              <span className="text-[0.6rem] uppercase tracking-wide text-slate">
                {SOURCE_LABEL[h.source]}
              </span>
            </div>
          ))}
          {st.phone && (
            <button
              onClick={() => copyText(st.phone)}
              className="text-slate text-xs underline"
            >
              {st.phone}
            </button>
          )}
        </div>
      );
    }

    if (st?.loading) return <span className="text-slate text-xs">…</span>;

    // Compute pattern email for CE employees that have no inline email.
    const patternEmail =
      !e.email && dominantPattern
        ? applyEmailFormat(dominantPattern.format, e.firstName, e.lastName, domain)
        : null;

    // Pre-reveal: show inline email (Tomba or pattern) + Enrich button.
    const inlineEmail = e.email ?? patternEmail;
    if (inlineEmail) {
      const isPattern = !e.email && !!patternEmail;
      return (
        <div className="flex flex-col gap-0.5 items-start">
          <button
            onClick={() => copyText(inlineEmail)}
            className="text-accent-soft underline break-all text-left leading-tight"
          >
            {inlineEmail}
          </button>
          <span
            className="text-[0.6rem] uppercase tracking-wide text-slate"
            title={
              isPattern
                ? `Pattern-derived from the ${dominantPattern?.percentage}% dominant format — not verified`
                : 'Pattern-derived address — not verified for deliverability'
            }
          >
            {isPattern ? 'pattern · likely' : 'unverified · likely'}
          </span>
          <button
            onClick={() => reveal(e)}
            className="retro-btn retro-btn-sm retro-btn-blue mt-0.5"
          >
            Enrich →
          </button>
        </div>
      );
    }

    // ContactOut rows that have a verified work email on file → hint before Reveal.
    if (e.hasContactOutEmail) {
      return (
        <div className="flex flex-col gap-0.5 items-start">
          <span className="text-[0.6rem] uppercase tracking-wide text-sky-400">work email on file</span>
          <button onClick={() => reveal(e)} className="retro-btn retro-btn-sm retro-btn-blue">
            Reveal →
          </button>
        </div>
      );
    }

    return (
      <button
        onClick={() => reveal(e)}
        className="retro-btn retro-btn-sm retro-btn-blue"
      >
        Reveal
      </button>
    );
  };

  if (loading && employees.length === 0) return <EmployeesSkeleton />;
  if (!loading && employees.length === 0) {
    if (error) return <SectionError onRetry={onRetry} />;
    return <div className="retro-panel-flat p-6 text-center text-slate">No employee records found.</div>;
  }

  return (
    <div className="pop-in">
      {/* Email format info box */}
      {emailFormat.length > 0 && domain && (
        <div className="retro-panel-flat px-3 py-2 mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-[0.6rem] uppercase tracking-[0.14em] text-slate font-bold shrink-0">
            Email format
          </span>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
            {emailFormat.map((p) => (
              <span key={p.format} className="flex items-center gap-1.5">
                <code className="font-mono text-[0.72rem] text-accent-soft">
                  {formatExample(p.format, domain)}
                </code>
                {emailFormat.length > 1 && (
                  <span className="text-[0.6rem] text-slate">{p.percentage}%</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="retro-panel-flat p-3 mb-3 flex flex-wrap items-end gap-3">
        <Field label="Department">
          <select className="retro-select" value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">All</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Seniority">
          <select className="retro-select" value={seniority} onChange={(e) => setSeniority(e.target.value)}>
            <option value="">All</option>
            {seniorities.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Country">
          <select className="retro-select" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">All</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {countryName(c)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sort">
          <select className="retro-select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="seniority">Seniority</option>
            <option value="name">Name A–Z</option>
            <option value="department">Department</option>
          </select>
        </Field>
        <label className="flex items-center gap-1.5 text-sm font-bold cursor-pointer">
          <input type="checkbox" checked={hasLinkedIn} onChange={(e) => setHasLinkedIn(e.target.checked)} />
          Has LinkedIn
        </label>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2 mb-2 text-sm">
        <span className="text-slate font-bold">
          Showing {filtered.length} of {employees.length} loaded
        </span>
        <div className="flex gap-2">
          <button className="retro-btn retro-btn-sm" onClick={copyAllEmails}>
            ⎘ Copy emails
          </button>
        </div>
      </div>

      {/* Desktop table */}
      <div className="retro-panel-flat overflow-hidden hidden md:block">
        <div className="scroll-y">
          <table className="retro-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Title</th>
                <th>Dept</th>
                <th>Seniority</th>
                <th>Email</th>
                <th>In</th>
                <th>Country</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => (
                <tr key={`${rowKey(e)}-${i}`}>
                  <td className="font-bold">
                    <div className="flex items-center gap-2">
                      <Avatar src={e.photo} name={e.fullName} size={26} />
                      <div className="flex flex-col gap-0.5">
                        {e.fullName}
                        <ConfidenceBadge source={e.source} />
                      </div>
                    </div>
                  </td>
                  <td>
                    {e.title || '—'}
                    {tenureLabel(e.startedAt) && (
                      <div className="text-[0.7rem] text-slate font-normal">{tenureLabel(e.startedAt)}</div>
                    )}
                  </td>
                  <td>{e.department || '—'}</td>
                  <td>{e.seniority || '—'}</td>
                  <td>
                    <EmailCell e={e} />
                  </td>
                  <td>
                    {e.linkedin ? (
                      <a href={e.linkedin} target="_blank" rel="noreferrer" className="text-accent-soft font-display">
                        in↗
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{e.country || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile card stack */}
      <div className="md:hidden space-y-2">
        {filtered.map((e, i) => (
          <div key={`${rowKey(e)}-${i}`} className="retro-panel-flat p-3">
            <div className="flex justify-between items-start gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <Avatar src={e.photo} name={e.fullName} size={34} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold truncate">{e.fullName}</span>
                    <ConfidenceBadge source={e.source} />
                  </div>
                  <div className="text-sm text-slate truncate">{e.title || '—'}</div>
                </div>
              </div>
              {e.linkedin && (
                <a href={e.linkedin} target="_blank" rel="noreferrer" className="text-accent-soft font-display shrink-0">
                  in↗
                </a>
              )}
            </div>
            <div className="text-xs text-slate mb-2 mt-1">
              {[e.department, e.seniority, e.country, tenureLabel(e.startedAt)].filter(Boolean).join(' · ') || '—'}
            </div>
            <EmailCell e={e} />
          </div>
        ))}
      </div>

      {/* Load more banner */}
      {totalAvailable > employees.length && (
        <div className="retro-panel-flat mt-4 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-accent/40 bg-[rgba(139,60,255,0.08)]">
          <div>
            <span className="font-display text-lg text-accent-soft">
              {employees.length} of ~{totalAvailable.toLocaleString()} results.
            </span>{' '}
            <span className="text-sm text-cream-dim">Connect Orthogonal to unlock the rest.</span>
          </div>
          <button className="retro-btn retro-btn-blue retro-btn-sm" onClick={onConnectClick}>
            Connect Orthogonal →
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.65rem] uppercase tracking-wide text-slate font-bold">{label}</span>
      {children}
    </label>
  );
}
