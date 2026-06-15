'use client';

import type { Company } from '@/lib/types';
import { timeAgo } from '@/lib/format';
import { useToast } from './Toast';

const SOCIAL_META: { key: keyof Company['socials']; label: string; icon: string }[] = [
  { key: 'linkedin', label: 'LinkedIn', icon: 'in' },
  { key: 'twitter', label: 'Twitter / X', icon: '𝕏' },
  { key: 'facebook', label: 'Facebook', icon: 'f' },
  { key: 'github', label: 'GitHub', icon: '⌥' },
  { key: 'instagram', label: 'Instagram', icon: '◉' },
  { key: 'youtube', label: 'YouTube', icon: '▶' },
];

function Stat({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-[0.65rem] uppercase tracking-wide text-slate font-bold">{label}</div>
      <div className="text-sm">{value || '—'}</div>
    </div>
  );
}

export function CompanyCardSkeleton({ domain }: { domain: string }) {
  return (
    <div className="retro-panel panel-accent p-5 my-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="loader-bar w-40" />
        <span className="font-body text-sm text-slate">Loading {domain}…</span>
      </div>
      <div className="skeleton h-7 w-64 mb-3" />
      <div className="skeleton h-4 w-full mb-2" />
      <div className="skeleton h-4 w-3/4 mb-4" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-9" />
        ))}
      </div>
    </div>
  );
}

export default function CompanyCard({ company }: { company: Company }) {
  const toast = useToast();
  const indexed = timeAgo(company.lastUpdated);

  const copyPattern = () => {
    if (!company.emailPattern) return;
    const example = company.emailPattern
      .replace('{first}', 'jane')
      .replace('{last}', 'doe')
      .replace('{f}', 'j')
      .replace('{l}', 'd');
    const addr = example.includes('@') ? example : `${example}@${company.domain}`;
    navigator.clipboard.writeText(addr).then(() => toast('Email pattern copied'));
  };

  const socials = SOCIAL_META.filter((s) => company.socials[s.key]);

  return (
    <div className="retro-panel panel-accent p-5 my-4 pop-in">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="font-display text-3xl sm:text-4xl">{company.name}</h2>
            {company.type && <span className="badge badge-slate">{company.type}</span>}
          </div>
          <a
            href={company.website}
            target="_blank"
            rel="noreferrer"
            className="text-accent-soft font-medium hover:text-accent underline break-all"
          >
            {company.domain}
          </a>
          {company.description && (
            <p className="mt-2 text-sm leading-relaxed">{company.description}</p>
          )}

          {company.industries.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {company.industries.map((ind) => (
                <span key={ind} className="badge badge-tag">
                  {ind}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          {indexed && <span className="text-[0.7rem] text-slate">Tomba indexed {indexed}</span>}
          {socials.length > 0 && (
            <div className="flex gap-1.5 mt-1">
              {socials.map((s) => (
                <a
                  key={s.key}
                  href={company.socials[s.key] as string}
                  target="_blank"
                  rel="noreferrer"
                  title={s.label}
                  className="w-8 h-8 grid place-items-center border border-line rounded-lg bg-card hover:bg-card-hover hover:border-accent transition-colors text-cream"
                >
                  {s.icon}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-5 pt-4 border-t border-line">
        <Stat label="Founded" value={company.founded} />
        <Stat label="Size" value={company.size} />
        <Stat label="Revenue" value={company.revenue} />
        <Stat label="HQ" value={company.hqLocation} />
        <Stat label="Email host" value={company.emailProvider} />
        <div>
          <div className="text-[0.65rem] uppercase tracking-wide text-slate font-bold">Pattern</div>
          {company.emailPattern ? (
            <button
              onClick={copyPattern}
              className="text-sm font-mono text-accent-soft hover:text-accent underline"
              title="Copy example email"
            >
              {company.emailPattern}
            </button>
          ) : (
            <div className="text-sm">—</div>
          )}
        </div>
      </div>

      {company.tech.length > 0 && (
        <div className="mt-4 pt-3 border-t border-line">
          <div className="text-[0.65rem] uppercase tracking-wide text-slate font-bold mb-1">
            Tech stack
          </div>
          <div className="flex flex-wrap gap-1.5">
            {company.tech.map((t) => (
              <span key={t} className="badge badge-tag">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
