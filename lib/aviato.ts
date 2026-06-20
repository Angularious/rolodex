// Aviato funding-rounds wrapper + mapper. Used as a waterfall fallback for the
// company profile's funding section when Company Enrich returns no round detail.
// Aviato is a structured deals database (Crunchbase-style) at a flat $0.08/call.

import { callOrthogonal } from './orthogonal';
import type { FundingRound } from './types';

const API = 'aviato';

// ---------------------------------------------------------------------------
// Raw response shape (only the fields we read)
// ---------------------------------------------------------------------------
interface RawInvestor {
  name?: string | null;
  fullName?: string | null;
}
interface RawAviatoRound {
  announcedOn?: string | null;
  moneyRaised?: number | null;
  name?: string | null;
  stage?: string | null;
  valuation?: { exact?: number | null; min?: number | null; max?: number | null } | null;
  leadCompanyInvestorList?: RawInvestor[] | null;
  companyInvestorList?: RawInvestor[] | null;
  leadPersonInvestorList?: RawInvestor[] | null;
  personInvestorList?: RawInvestor[] | null;
}
interface RawAviatoFunding {
  fundingRounds?: RawAviatoRound[] | null;
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------
/** Funding rounds for a domain. Flat $0.08 regardless of perPage. */
export const fundingRounds = (domain: string) =>
  callOrthogonal<RawAviatoFunding>(
    API,
    '/company/funding-rounds',
    { website: domain, page: 0, perPage: 25 },
    'GET',
  );

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------
// Rows that aren't priced primary raises — exclude from the funding card.
const NON_ROUND_RE = /acquisition|merger|ipo|spac|buyout|tender|secondary/i;

function fmtMoney(n: number | null | undefined): string | null {
  if (n == null || n <= 0) return null;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(n % 1e9 ? 1 : 0)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}M`;
  return `$${Math.round(n / 1e3)}K`;
}

function valuationOf(r: RawAviatoRound): number | null {
  return r.valuation?.exact ?? r.valuation?.max ?? r.valuation?.min ?? null;
}

function investorsOf(r: RawAviatoRound): string | null {
  const leads = [...(r.leadCompanyInvestorList ?? []), ...(r.leadPersonInvestorList ?? [])];
  const rest = [...(r.companyInvestorList ?? []), ...(r.personInvestorList ?? [])];
  const names: string[] = [];
  for (const i of [...leads, ...rest]) {
    const n = i.name || i.fullName;
    if (n && !names.includes(n)) names.push(n);
  }
  return names.length ? names.join(', ') : null;
}

/**
 * Clean Aviato funding rounds into the Company funding shape. Applies a sanity
 * filter: a single round can't raise more than the company's highest known
 * valuation (this is what catches Aviato mislabelling an acquisition — e.g. the
 * $20B Adobe deal — as a "Venture Round"), and acquisition/IPO-shaped rows are
 * dropped. Returns null if nothing usable remains.
 */
export function mapAviatoFunding(
  raw: RawAviatoFunding,
): { fundingTotal: string | null; fundingStage: string | null; fundingRounds: FundingRound[] } | null {
  const rounds = raw?.fundingRounds ?? [];
  if (!rounds.length) return null;

  const maxVal = Math.max(
    0,
    ...rounds.map(valuationOf).filter((v): v is number => typeof v === 'number'),
  );

  const clean = rounds
    .filter((r) => {
      const amt = r.moneyRaised ?? 0;
      if (amt <= 0) return false;
      if (NON_ROUND_RE.test(r.stage ?? '') || NON_ROUND_RE.test(r.name ?? '')) return false;
      if (maxVal && amt > maxVal) return false; // raise > max valuation = bad row
      return true;
    })
    .sort((a, b) => Date.parse(b.announcedOn ?? '') - Date.parse(a.announcedOn ?? ''));

  if (!clean.length) return null;

  const out: FundingRound[] = clean.map((r) => ({
    date: r.announcedOn ? r.announcedOn.slice(0, 10) : null,
    amount: fmtMoney(r.moneyRaised),
    type: r.stage ?? null,
    investors: investorsOf(r),
  }));

  const total = clean.reduce((s, r) => s + (r.moneyRaised ?? 0), 0);

  return {
    fundingTotal: fmtMoney(total),
    fundingStage: clean[0].stage ?? null,
    fundingRounds: out,
  };
}
