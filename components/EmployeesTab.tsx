'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Employee, RevealResult } from '@/lib/types';
import { countryName } from '@/lib/format';
import { useToast } from './Toast';
import { SectionError } from './DepartmentsTab';
import { Avatar } from './DecisionMakersTab';

// "2025-02-01" → "Since 2025" for a compact tenure hint.
function tenureLabel(startedAt?: string | null): string | null {
  if (!startedAt) return null;
  const year = startedAt.slice(0, 4);
  return /^\d{4}$/.test(year) ? `Since ${year}` : null;
}

type SortKey = 'name' | 'seniority' | 'department';

// Best-effort ordering for Company Enrich seniority labels.
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

export type RevealFn = (payload: {
  ceId?: string | null;
  linkedin?: string | null;
}) => Promise<RevealResult>;

interface RevealState {
  loading: boolean;
  tried: boolean;
  email: string | null;
  phone: string | null;
}

function rowKey(e: Employee): string {
  return e.ceId || e.linkedin || e.fullName;
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
}: {
  employees: Employee[];
  totalAvailable: number;
  loading: boolean;
  forcedDepartment: string | null;
  onReveal: RevealFn;
  onConnectClick: () => void;
  error?: boolean;
  onRetry?: () => void;
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
    setRevealed((r) => ({ ...r, [key]: { loading: true, tried: false, email: null, phone: null } }));
    try {
      const res = await onReveal({ ceId: e.ceId, linkedin: e.linkedin });
      setRevealed((r) => ({
        ...r,
        [key]: { loading: false, tried: true, email: res.email, phone: res.phone ?? null },
      }));
      if (res.email) toast(`Revealed ${res.email}`);
      else toast('No email found');
    } catch {
      setRevealed((r) => ({ ...r, [key]: { loading: false, tried: true, email: null, phone: null } }));
      toast('Reveal failed');
    }
  };

  const copyEmail = (email: string | null) => {
    if (!email) return;
    navigator.clipboard.writeText(email).then(() => toast(`Copied ${email}`));
  };

  const copyAllEmails = () => {
    const emails = filtered
      .map((e) => revealed[rowKey(e)]?.email)
      .filter(Boolean)
      .join(', ');
    if (!emails) return toast('Reveal some emails first');
    navigator.clipboard.writeText(emails).then(() => toast('Copied revealed emails'));
  };

  if (loading && employees.length === 0) return <EmployeesSkeleton />;
  if (!loading && employees.length === 0) {
    if (error) return <SectionError onRetry={onRetry} />;
    return <div className="retro-panel-flat p-6 text-center text-slate">No employee records found.</div>;
  }

  const EmailCell = ({ e }: { e: Employee }) => {
    const st = revealed[rowKey(e)];
    if (st?.email)
      return (
        <button onClick={() => copyEmail(st.email)} className="text-accent-soft underline break-all">
          {st.email}
        </button>
      );
    if (st?.tried) return <span className="text-slate text-xs">not found</span>;
    // Tomba filler row: a pattern-derived address shown for free. Label it clearly
    // and still offer Reveal to confirm deliverability / add a phone.
    if (e.email && e.emailUnverified)
      return (
        <div className="flex flex-col gap-0.5 items-start">
          <button onClick={() => copyEmail(e.email!)} className="text-accent-soft underline break-all">
            {e.email}
          </button>
          <span
            className="text-[0.6rem] uppercase tracking-wide text-slate"
            title="Pattern-derived address — not verified for deliverability"
          >
            unverified · likely
          </span>
        </div>
      );
    return (
      <button
        onClick={() => reveal(e)}
        disabled={st?.loading}
        className="retro-btn retro-btn-sm retro-btn-blue"
      >
        {st?.loading ? '…' : 'Reveal'}
      </button>
    );
  };

  return (
    <div className="pop-in">
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
            ⎘ Copy revealed
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
                      {e.fullName}
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
                  <div className="font-bold truncate">{e.fullName}</div>
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
