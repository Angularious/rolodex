'use client';

import { useMemo, useState } from 'react';
import type { DecisionMaker } from '@/lib/types';
import type { RevealFn } from './EmployeesTab';
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

// Avatar that quietly removes itself if the image fails to load (some profile
// image URLs 404 / require auth) — falls back to initials.
export function Avatar({ src, name, size = 40 }: { src?: string | null; name: string; size?: number }) {
  const [ok, setOk] = useState(Boolean(src));
  const initials = name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  const style = { width: size, height: size };
  if (src && ok) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt=""
        style={style}
        onError={() => setOk(false)}
        className="rounded-full object-cover border border-line shrink-0"
      />
    );
  }
  return (
    <div
      style={style}
      className="rounded-full grid place-items-center bg-card border border-line text-[0.6rem] font-bold text-slate shrink-0"
    >
      {initials || '—'}
    </div>
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
  error,
  onRetry,
}: {
  decisionMakers: DecisionMaker[] | null;
  loading: boolean;
  onReveal: RevealFn;
  error?: boolean;
  onRetry?: () => void;
}) {
  const toast = useToast();
  const [func, setFunc] = useState('');
  const [revealed, setRevealed] = useState<Record<string, RevealState>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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
      const res = await onReveal({ ceId: d.ceId, linkedin: d.linkedin });
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

  return (
    <div className="pop-in">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <p className="text-sm text-slate">
          {decisionMakers.length} senior decision-makers. Reveal pulls a verified
          email/phone on demand.
        </p>
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {list.map((d) => {
          const st = revealed[rowKey(d)];
          return (
            <div key={rowKey(d)} className="retro-panel-flat p-3">
              <div className="flex justify-between items-start gap-2">
                <div className="flex items-start gap-2.5 min-w-0">
                  <Avatar src={d.photo} name={d.name} />
                  <div className="min-w-0">
                    <div className="font-bold truncate">{d.name}</div>
                    <div className="text-sm text-slate truncate">{d.title || d.headline || '—'}</div>
                    <div className="text-xs text-slate truncate">
                      {[d.jobFunction, d.seniority, d.location, d.followers ? `${d.followers.toLocaleString()} followers` : null]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </div>
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

              {(d.summary || d.experience?.length || d.education?.length || d.skills?.length) && (
                <div className="mt-2">
                  <button
                    onClick={() => setExpanded((e) => ({ ...e, [rowKey(d)]: !e[rowKey(d)] }))}
                    className="text-xs font-mono text-accent-soft hover:underline"
                  >
                    {expanded[rowKey(d)] ? 'Hide profile ▴' : 'Profile ▾'}
                  </button>
                  {expanded[rowKey(d)] && (
                    <div className="mt-2 space-y-2 text-xs">
                      {d.summary && <p className="text-cream-dim leading-relaxed line-clamp-4">{d.summary}</p>}
                      {d.experience && d.experience.length > 0 && (
                        <div>
                          <div className="text-slate font-bold uppercase tracking-wide text-[0.6rem] mb-0.5">Experience</div>
                          <ul className="text-cream-dim space-y-0.5">
                            {d.experience.map((x, i) => <li key={i}>· {x}</li>)}
                          </ul>
                        </div>
                      )}
                      {d.education && d.education.length > 0 && (
                        <div>
                          <div className="text-slate font-bold uppercase tracking-wide text-[0.6rem] mb-0.5">Education</div>
                          <ul className="text-cream-dim space-y-0.5">
                            {d.education.map((x, i) => <li key={i}>· {x}</li>)}
                          </ul>
                        </div>
                      )}
                      {d.skills && d.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {d.skills.map((s) => (
                            <span key={s} className="badge badge-tag">{s}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

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
