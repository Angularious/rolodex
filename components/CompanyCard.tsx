'use client';

import type { Company } from '@/lib/types';
import { timeAgo } from '@/lib/format';

const SOCIAL_META: { key: keyof Company['socials']; label: string; icon: string }[] = [
  { key: 'linkedin', label: 'LinkedIn', icon: 'in' },
  { key: 'twitter', label: 'Twitter / X', icon: '𝕏' },
  { key: 'facebook', label: 'Facebook', icon: 'f' },
  { key: 'github', label: 'GitHub', icon: '⌥' },
  { key: 'instagram', label: 'Instagram', icon: '◉' },
  { key: 'youtube', label: 'YouTube', icon: '▶' },
  { key: 'crunchbase', label: 'Crunchbase', icon: 'cb' },
  { key: 'angellist', label: 'AngelList', icon: 'a' },
  { key: 'g2', label: 'G2', icon: 'G2' },
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
  const indexed = timeAgo(company.lastUpdated);
  const socials = SOCIAL_META.filter((s) => company.socials[s.key]);
  const rounds = company.fundingRounds ?? [];

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
          {indexed && <span className="text-[0.7rem] text-slate">Indexed {indexed}</span>}
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
        <Stat label="Total funding" value={company.fundingTotal} />
        <Stat label="Ticker" value={company.stockSymbol} />
        <Stat label="Phone" value={company.phone} />
      </div>

      {company.keywords && company.keywords.length > 0 && (
        <div className="mt-4 pt-3 border-t border-line">
          <div className="text-[0.65rem] uppercase tracking-wide text-slate font-bold mb-1">
            Keywords
          </div>
          <div className="flex flex-wrap gap-1.5">
            {company.keywords.map((k) => (
              <span key={k} className="badge badge-slate">
                {k}
              </span>
            ))}
          </div>
        </div>
      )}

      {rounds.length > 0 && (
        <div className="mt-4 pt-3 border-t border-line">
          <div className="text-[0.65rem] uppercase tracking-wide text-slate font-bold mb-2">
            Funding {company.fundingStage ? `· ${company.fundingStage.replace(/_/g, ' ')}` : ''}
            {company.fundingDate ? ` · last ${company.fundingDate}` : ''}
          </div>
          <div className="flex flex-col gap-1.5">
            {rounds.slice(0, 8).map((r, i) => (
              <div
                key={`${r.type ?? 'round'}-${i}`}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span className="font-bold whitespace-nowrap">{r.type || 'Round'}</span>
                <span className="font-mono text-accent-soft whitespace-nowrap">
                  {r.amount || '—'}
                  {r.valuation ? <span className="text-slate"> @ {r.valuation}</span> : null}
                </span>
                <span className="text-slate text-xs truncate flex-1 text-right">
                  {[r.date ? r.date.slice(0, 10) : null, r.investors].filter(Boolean).join(' · ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

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
