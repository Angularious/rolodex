'use client';

import { useMemo, useState } from 'react';
import type { DecisionMaker } from '@/lib/types';
import type { RevealFn } from './EmployeesTab';
import { csvEscape } from '@/lib/format';
import { useToast } from './Toast';
import { Unavailable, SectionError } from './DepartmentsTab';

interface RevealState {
  loading: boolean;
  tried: boolean;
  email: string | null;
  phone: string | null;
}

function rowKey(d: DecisionMaker): string {
  return d.linkedin || d.name;
}

function Coverage({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`badge ${ok ? 'badge-green' : 'badge-slate'}`} title={`${label}: ${ok ? 'available' : 'none'}`}>
      {ok ? '✓' : '✕'} {label}
    </span>
  );
}

export function DecisionMakersSkeleton() {
  return (
    <div className="pop-in">
      <div className="loader-bar w-full mb-4" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="skeleton h-14 mb-2" />
      ))}
    </div>
  );
}

export default function DecisionMakersTab({
  decisionMakers,
  loading,
  onReveal,
  domain,
  error,
  onRetry,
}: {
  decisionMakers: DecisionMaker[] | null;
  loading: boolean;
  onReveal: RevealFn;
  domain: string;
  error?: boolean;
  onRetry?: () => void;
}) {
  const toast = useToast();
  const [func, setFunc] = useState('');
  const [revealed, setRevealed] = useState<Record<string, RevealState>>({});

  const functions = useMemo(
    () =>
      Array.from(new Set((decisionMakers ?? []).map((d) => d.jobFunction).filter(Boolean))).sort() as string[],
    [decisionMakers],
  );

  const list = useMemo(
    () => (decisionMakers ?? []).filter((d) => !func || d.jobFunction === func),
    [decisionMakers, func],
  );

  if (loading && (!decisionMakers || decisionMakers.length === 0)) return <DecisionMakersSkeleton />;
  if (!decisionMakers) return error ? <SectionError onRetry={onRetry} /> : <Unavailable />;
  if (decisionMakers.length === 0)
    return <div className="retro-panel-flat p-6 text-center text-slate">No decision-makers found.</div>;

  const reveal = async (d: DecisionMaker) => {
    const key = rowKey(d);
    if (revealed[key]?.loading || revealed[key]?.tried) return;
    setRevealed((r) => ({ ...r, [key]: { loading: true, tried: false, email: null, phone: null } }));
    try {
      const res = await onReveal({ linkedin: d.linkedin });
      setRevealed((r) => ({
        ...r,
        [key]: { loading: false, tried: true, email: res.email, phone: res.phone ?? null },
      }));
      if (res.email || res.phone) toast(`Revealed ${d.name}`);
      else toast('No contact found');
    } catch {
      setRevealed((r) => ({ ...r, [key]: { loading: false, tried: true, email: null, phone: null } }));
      toast('Reveal failed');
    }
  };

  const copy = (v: string) => navigator.clipboard.writeText(v).then(() => toast(`Copied ${v}`));

  const exportCsv = () => {
    const header = ['Name', 'Title', 'Job function', 'Seniority', 'Location', 'Email', 'Phone', 'LinkedIn'];
    const rows = list.map((d) => {
      const st = revealed[rowKey(d)];
      return [
        d.name,
        d.title ?? '',
        d.jobFunction ?? '',
        d.seniority ?? '',
        d.location ?? '',
        st?.email ?? '',
        st?.phone ?? '',
        d.linkedin ?? '',
      ]
        .map((v) => csvEscape(v))
        .join(',');
    });
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${domain}-decision-makers.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('CSV exported');
  };

  return (
    <div className="pop-in">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <p className="text-sm text-slate">
          {decisionMakers.length} decision-makers. Badges show contact coverage before you spend.
          Reveal pulls a verified email/phone on demand.
        </p>
        <div className="flex items-center gap-2">
          {functions.length > 0 && (
            <select className="retro-select" value={func} onChange={(e) => setFunc(e.target.value)}>
              <option value="">All functions</option>
              {functions.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          )}
          <button className="retro-btn retro-btn-sm retro-btn-blue" onClick={exportCsv}>
            ⤓ Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {list.map((d) => {
          const st = revealed[rowKey(d)];
          const noContact = !d.hasWorkEmail && !d.hasPersonalEmail && !d.hasPhone;
          return (
            <div key={rowKey(d)} className="retro-panel-flat p-3">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <div className="font-bold truncate">{d.name}</div>
                  <div className="text-sm text-slate truncate">{d.title || d.headline || '—'}</div>
                  <div className="text-xs text-slate truncate">
                    {[d.jobFunction, d.seniority, d.location].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
                {d.linkedin && (
                  <a
                    href={d.linkedin}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent-soft font-display shrink-0"
                  >
                    in↗
                  </a>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 mt-2">
                <Coverage ok={d.hasWorkEmail} label="Work email" />
                <Coverage ok={d.hasPersonalEmail} label="Personal" />
                <Coverage ok={d.hasPhone} label="Phone" />
              </div>

              <div className="mt-2">
                {st?.email || st?.phone ? (
                  <div className="flex flex-col gap-1 text-sm">
                    {st.email && (
                      <button onClick={() => copy(st.email!)} className="text-accent-soft underline break-all text-left">
                        {st.email}
                      </button>
                    )}
                    {st.phone && (
                      <button onClick={() => copy(st.phone!)} className="text-accent-soft underline text-left">
                        {st.phone}
                      </button>
                    )}
                  </div>
                ) : st?.tried ? (
                  <span className="text-slate text-xs">No contact found</span>
                ) : noContact ? (
                  <button
                    disabled
                    title="No work email, personal email, or phone on file — a reveal would cost money and return nothing"
                    className="retro-btn retro-btn-sm opacity-40 cursor-not-allowed"
                  >
                    No contact available
                  </button>
                ) : (
                  <button
                    onClick={() => reveal(d)}
                    disabled={st?.loading}
                    className="retro-btn retro-btn-sm retro-btn-blue"
                  >
                    {st?.loading ? 'Revealing…' : 'Reveal contact'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
