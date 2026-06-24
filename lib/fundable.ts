// Fundable funding-rounds wrapper + mapper. Replaces Aviato as the waterfall
// fallback for the company profile's funding section when Company Enrich returns
// no round detail. Cost: $0.066 × PAGE_SIZE per call ($0.462 at default PAGE_SIZE=7).

import { callOrthogonal } from './orthogonal';
import { fmtMoney } from './format';
import type { FundingRound } from './types';

const API = 'fundable';
const PAGE_SIZE = 7; // most recent N rounds; cost = 0.066 × PAGE_SIZE

// Drop acquisition/IPO/merger events — they inflate the total and are not
// financing rounds. Mirrors the NON_ROUND_RE guard Aviato used.
const NON_ROUND_RE = /acquisition|merger|ipo|spac|buyout|tender/i;

// ---------------------------------------------------------------------------
// Raw response shape (only the fields we read)
// ---------------------------------------------------------------------------
interface RawFundableDeal {
  date?: string | null;
  round_type?: string | null;
  total_round_raised?: number | null;
  valuation?: {
    valuation_usd?: number | null;
  } | null;
}

interface RawFundableDeals {
  deals?: RawFundableDeal[] | null;
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------
/** Funding rounds for a domain. Returns the most recent PAGE_SIZE rounds. */
export const fundingRounds = (domain: string) =>
  callOrthogonal<RawFundableDeals>(
    API,
    '/company/deals',
    // Coerce numerics to strings explicitly — /v1/run rejects non-string GET query values.
    { domain, page_size: String(PAGE_SIZE), page: '0' },
    'GET',
  );

export const FUNDABLE_COST = 0.066 * PAGE_SIZE;

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------
const ROUND_LABEL: Record<string, string> = {
  EQUITY: 'Equity Round',
  DEBT: 'Debt Financing',
  GRANT: 'Grant',
  CONVERTIBLE: 'Convertible Note',
  SECONDARY: 'Secondary',
};

export function mapFundableFunding(
  raw: RawFundableDeals,
): { fundingTotal: string | null; fundingStage: string | null; fundingRounds: FundingRound[] } | null {
  const deals = (raw?.deals ?? [])
    .filter((d) => (d.total_round_raised ?? 0) > 0 && !NON_ROUND_RE.test(d.round_type ?? ''))
    .sort((a, b) => Date.parse(b.date ?? '') - Date.parse(a.date ?? '')); // newest first
  if (!deals.length) return null;

  const out: FundingRound[] = deals.map((d) => ({
    date: d.date ? d.date.slice(0, 10) : null,
    amount: fmtMoney(d.total_round_raised),
    // Use || null so empty-string round_type becomes null, not a blank label.
    type: ROUND_LABEL[d.round_type ?? ''] ?? (d.round_type || null),
    investors: null, // Fundable returns investor IDs, not names
    valuation: fmtMoney(d.valuation?.valuation_usd),
  }));

  const total = deals.reduce((s, d) => s + (d.total_round_raised ?? 0), 0);

  // deals is sorted newest-first, so deals[0] is the most recent round.
  return {
    fundingTotal: fmtMoney(total),
    fundingStage: ROUND_LABEL[deals[0].round_type ?? ''] ?? (deals[0].round_type || null),
    fundingRounds: out,
  };
}
