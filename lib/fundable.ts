// Fundable funding-rounds wrapper + mapper. Fires as a waterfall fallback when
// Company Enrich returns no round detail. Cost: $0.066 × PAGE_SIZE per call.

import { callOrthogonal } from './orthogonal';
import { fmtMoney } from './format';
import type { FundingRound } from './types';

const API = 'fundable';
// Only fetch the single most recent round — all the UI needs is "last raise +
// when". Cost: $0.066 × 1 = $0.066. Raise to 3-4 if a full history is wanted.
// Fetch enough rounds that a newest-first sort can find one with an amount,
// even when Fundable returns deals oldest-first (page 0). 4 rounds covers
// most multi-stage companies while keeping cost at $0.264 (vs $0.462 at 7).
const PAGE_SIZE = 4;

// Drop acquisition/IPO/merger events — they inflate the total and are not
// financing rounds.
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
  deal_descriptions?: {
    short_description?: string | null;
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
  // Series rounds (common Fundable round_type values)
  SEED: 'Seed',
  PRE_SEED: 'Pre-Seed',
  ANGEL: 'Angel',
  SERIES_A: 'Series A',
  SERIES_B: 'Series B',
  SERIES_C: 'Series C',
  SERIES_D: 'Series D',
  SERIES_E: 'Series E',
  SERIES_F: 'Series F',
  SERIES_G: 'Series G',
  // Generic financing types
  EQUITY: 'Equity Round',
  DEBT: 'Debt Financing',
  GRANT: 'Grant',
  CONVERTIBLE: 'Convertible Note',
  SECONDARY: 'Secondary',
  GROWTH: 'Growth',
  CORPORATE: 'Corporate Round',
  VENTURE: 'Venture Round',
};

/**
 * Extract investor names from Fundable's deal description text.
 * Pattern: "… led by X with participation from Y, Z and W."
 */
function extractInvestors(desc: string | null | undefined): string | null {
  if (!desc) return null;
  const investors: string[] = [];

  // "led by X" — up to "with participation", connector, period, or end
  const ledBy = desc.match(/\bled\s+by\s+([^.,]+?)(?:\s+with\s+participation|\s+and\s+[\w]|\.|,|$)/i);
  if (ledBy?.[1]) {
    investors.push(...ledBy[1].split(/\s+and\s+/i).map((s) => s.trim()).filter(Boolean));
  }

  // "participation from (existing investors)? X, Y and Z"
  const partFrom = desc.match(/participation\s+from\s+(?:existing\s+investors?\s+)?(.+?)(?:\.|$)/i);
  if (partFrom?.[1]) {
    const parts = partFrom[1]
      .split(/,\s*|\s+and\s+/i)
      .map((s) => s.trim())
      .filter((s) => s.length > 1);
    investors.push(...parts);
  }

  if (!investors.length) return null;
  return Array.from(new Set(investors)).join(', ');
}

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
    investors: extractInvestors(d.deal_descriptions?.short_description),
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
