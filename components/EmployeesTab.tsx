'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Employee } from '@/lib/types';
import { confidenceClass, countryName, csvEscape } from '@/lib/format';
import { useToast } from './Toast';

type SortKey = 'confidence' | 'name' | 'seniority' | 'department';

const SENIORITY_RANK: Record<string, number> = { executive: 0, senior: 1, junior: 2 };

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
  domain,
  onConnectClick,
}: {
  employees: Employee[];
  totalAvailable: number;
  loading: boolean;
  forcedDepartment: string | null;
  domain: string;
  onConnectClick: () => void;
}) {
  const toast = useToast();
  const [dept, setDept] = useState('');
  const [seniority, setSeniority] = useState('');
  const [country, setCountry] = useState('');
  const [hasEmail, setHasEmail] = useState(false);
  const [hasLinkedIn, setHasLinkedIn] = useState(false);
  const [minConfidence, setMinConfidence] = useState(0);
  const [sort, setSort] = useState<SortKey>('confidence');
  const [showLow, setShowLow] = useState(false);

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
      if (!showLow && e.confidence < 20) return false;
      if (e.confidence < minConfidence) return false;
      if (dept && e.department !== dept) return false;
      if (seniority && e.seniority !== seniority) return false;
      if (country && e.country !== country) return false;
      if (hasEmail && !e.email) return false;
      if (hasLinkedIn && !e.linkedin) return false;
      return true;
    });
    list.sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.fullName.localeCompare(b.fullName);
        case 'department':
          return (a.department || 'zzz').localeCompare(b.department || 'zzz');
        case 'seniority':
          return (
            (SENIORITY_RANK[a.seniority ?? ''] ?? 9) - (SENIORITY_RANK[b.seniority ?? ''] ?? 9)
          );
        default:
          return b.confidence - a.confidence;
      }
    });
    return list;
  }, [employees, showLow, minConfidence, dept, seniority, country, hasEmail, hasLinkedIn, sort]);

  const lowCount = employees.filter((e) => e.confidence < 20).length;

  const copyEmail = (email: string | null) => {
    if (!email) return;
    navigator.clipboard.writeText(email).then(() => toast(`Copied ${email}`));
  };

  const copyAllEmails = () => {
    const emails = filtered.map((e) => e.email).filter(Boolean).join(', ');
    if (!emails) return toast('No emails in current view');
    navigator.clipboard.writeText(emails).then(() => toast(`Copied ${filtered.filter((e) => e.email).length} emails`));
  };

  const exportCsv = () => {
    const header = ['Name', 'Title', 'Department', 'Seniority', 'Email', 'LinkedIn', 'Country', 'Confidence'];
    const rows = filtered.map((e) =>
      [
        e.fullName,
        e.title ?? '',
        e.department ?? '',
        e.seniority ?? '',
        e.email ?? '',
        e.linkedin ?? '',
        e.country ?? '',
        String(e.confidence),
      ]
        .map((v) => csvEscape(v))
        .join(','),
    );
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${domain}-employees.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('CSV exported');
  };

  if (loading && employees.length === 0) return <EmployeesSkeleton />;
  if (!loading && employees.length === 0)
    return <div className="retro-panel-flat p-6 text-center text-slate">No employee records found.</div>;

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
        <Field label={`Min confidence: ${minConfidence}`}>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={minConfidence}
            onChange={(e) => setMinConfidence(Number(e.target.value))}
            className="retro-range w-32"
          />
        </Field>
        <Field label="Sort">
          <select className="retro-select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="confidence">Confidence ↓</option>
            <option value="name">Name A–Z</option>
            <option value="seniority">Seniority</option>
            <option value="department">Department</option>
          </select>
        </Field>
        <label className="flex items-center gap-1.5 text-sm font-bold cursor-pointer">
          <input type="checkbox" checked={hasEmail} onChange={(e) => setHasEmail(e.target.checked)} />
          Has email
        </label>
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
          <button className="retro-btn retro-btn-sm retro-btn-blue" onClick={exportCsv}>
            ⤓ Export CSV
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
                <th title="Emails are pattern-inferred and not always verified">Conf. ⓘ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => (
                <tr key={`${e.email ?? e.fullName}-${i}`} onClick={() => copyEmail(e.email)} title="Click row to copy email">
                  <td className="font-bold">{e.fullName}</td>
                  <td>{e.title || '—'}</td>
                  <td>{e.department || '—'}</td>
                  <td>{e.seniority || '—'}</td>
                  <td>
                    {e.email ? (
                      <button
                        onClick={(ev) => {
                          ev.stopPropagation();
                          copyEmail(e.email);
                        }}
                        className="text-cobalt underline"
                      >
                        {e.email}
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td onClick={(ev) => ev.stopPropagation()}>
                    {e.linkedin ? (
                      <a href={e.linkedin} target="_blank" rel="noreferrer" className="text-cobalt font-display">
                        in↗
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{e.country || '—'}</td>
                  <td>
                    <span className={`badge ${confidenceClass(e.confidence)}`}>{e.confidence}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile card stack */}
      <div className="md:hidden space-y-2">
        {filtered.map((e, i) => (
          <div key={`${e.email ?? e.fullName}-${i}`} className="retro-panel-flat p-3" onClick={() => copyEmail(e.email)}>
            <div className="flex justify-between items-start gap-2">
              <div className="font-bold">{e.fullName}</div>
              <span className={`badge ${confidenceClass(e.confidence)}`}>{e.confidence}</span>
            </div>
            <div className="text-sm text-slate">{e.title || '—'}</div>
            <div className="text-xs text-slate mb-1">
              {[e.department, e.seniority, e.country].filter(Boolean).join(' · ') || '—'}
            </div>
            <div className="flex items-center gap-3 text-sm">
              {e.email ? (
                <button onClick={(ev) => { ev.stopPropagation(); copyEmail(e.email); }} className="text-cobalt underline break-all">
                  {e.email}
                </button>
              ) : (
                <span className="text-slate">no email</span>
              )}
              {e.linkedin && (
                <a href={e.linkedin} target="_blank" rel="noreferrer" onClick={(ev) => ev.stopPropagation()} className="text-cobalt font-display ml-auto">
                  in↗
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {lowCount > 0 && (
        <button className="text-sm text-slate underline mt-3" onClick={() => setShowLow((v) => !v)}>
          {showLow ? 'Hide' : 'Show'} {lowCount} low-confidence (&lt;20) result{lowCount === 1 ? '' : 's'}
        </button>
      )}

      {/* Load more banner */}
      {totalAvailable > employees.length && (
        <div className="retro-panel-flat panel-accent mt-4 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#11163a] text-white">
          <div>
            <span className="font-display text-lg text-neon">
              {employees.length} of ~{totalAvailable.toLocaleString()} results.
            </span>{' '}
            <span className="text-sm opacity-90">Connect Orthogonal to unlock the rest.</span>
          </div>
          <button className="retro-btn retro-btn-sm" onClick={onConnectClick}>
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
