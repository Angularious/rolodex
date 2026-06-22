// Shared types for the company intelligence report.

export interface SocialLinks {
  twitter?: string | null;
  linkedin?: string | null;
  facebook?: string | null;
  github?: string | null;
  instagram?: string | null;
  youtube?: string | null;
  crunchbase?: string | null;
  angellist?: string | null;
  g2?: string | null;
}

export interface FundingRound {
  date: string | null; // ISO date or null
  amount: string | null; // human label, e.g. "$415.7M" or null
  type: string | null; // e.g. "Series F"
  investors: string | null; // comma-joined investor names or null
  valuation?: string | null; // human label, e.g. "$35B" (Aviato-sourced rounds only)
}

export interface Company {
  name: string;
  domain: string;
  description?: string | null;
  website: string;
  founded?: string | null;
  size?: string | null; // employee-count range, e.g. "1K-5K"
  revenue?: string | null; // revenue range, e.g. "200m-1b"
  type?: string | null;
  industries: string[];
  categories?: string[]; // e.g. ["b2b", "saas"]
  hqLocation?: string | null;
  phone?: string | null; // HQ phone, e.g. "+1 415-298-5539"
  logo?: string | null;
  socials: SocialLinks;
  tech: string[];
  keywords?: string[]; // descriptor tags, e.g. ["payment processing", "billing"]
  // Funding
  fundingTotal?: string | null; // human label, e.g. "$747M"
  fundingStage?: string | null; // e.g. "secondary_market"
  fundingDate?: string | null; // ISO date of the most recent funding event
  fundingRounds?: FundingRound[];
  stockSymbol?: string | null; // e.g. "NYSE:FIG"
  lastUpdated?: string | null;
}

export interface DeptCount {
  name: string;
  count: number;
  delta?: number | null; // headcount change over the workforce history window
}

export interface WorkforcePoint {
  date: string;
  total: number;
}

export interface Workforce {
  total: number; // observed employee count
  range: string | null; // employee-count bucket
  departments: DeptCount[];
  history?: WorkforcePoint[]; // oldest→newest, for a trend line
  growthSince?: string | null; // ISO date the per-department deltas are measured from
}

export interface Competitor {
  domain: string;
  name?: string | null;
  industries?: string | null;
}

export interface Employee {
  ceId: string | null; // CompanyEnrich person id (enables cheap email reveal)
  firstName?: string | null;
  lastName?: string | null;
  fullName: string;
  title?: string | null;
  department?: string | null;
  seniority?: string | null;
  linkedin?: string | null;
  country?: string | null; // ISO-2 uppercased
  location?: string | null; // human label (city, country)
  photo?: string | null; // profile image URL
  startedAt?: string | null; // ISO start date of the role at this company
  // Revealed on demand via /api/reveal; null until then.
  email?: string | null;
  // True when `email` is an unverified, pattern-derived address (Tomba
  // domain-search filler row) rather than a verified reveal. UI labels it.
  emailUnverified?: boolean;
  // Provenance — Tomba filler rows lack a photo / city / ceId and carry an
  // unverified inline email; CE rows are the richer, verified-reveal source.
  source?: 'company-enrich' | 'tomba';
}

export interface DecisionMaker {
  name: string;
  title?: string | null;
  headline?: string | null;
  location?: string | null;
  country?: string | null; // ISO-2 uppercased
  seniority?: string | null;
  jobFunction?: string | null;
  linkedin?: string | null;
  // Rich profile fields returned free by the decision-makers call.
  photo?: string | null; // profile picture URL
  summary?: string | null; // bio
  followers?: number | null;
  industry?: string | null;
  skills?: string[]; // top skills
  experience?: string[]; // pre-formatted work-history lines
  education?: string[]; // pre-formatted education lines
  // Coverage flags returned for free (before paying to reveal).
  hasWorkEmail: boolean;
  hasPersonalEmail: boolean;
  hasPhone: boolean;
  // Revealed on demand via /api/reveal; null until then.
  email?: string | null;
  phone?: string | null;
}

// NDJSON stream message types emitted by /api/search
export type StreamMessage =
  | { type: 'meta'; domain: string; resolvedFrom?: string | null }
  | { type: 'company'; data: Company | null; error?: string }
  | { type: 'workforce'; data: Workforce | null; error?: string }
  | { type: 'competitors'; data: Competitor[] | null; error?: string }
  | { type: 'employees'; data: Employee[]; totalAvailable: number; error?: string }
  | { type: 'decisionmakers'; data: DecisionMaker[] | null; error?: string }
  // Aborts the report mid-stream and shows a full-screen error (e.g. the
  // Orthogonal key hit its limit, so every section is failing the same way).
  | { type: 'fatal'; error: SearchError['error'] }
  | { type: 'done'; cost: number; durationMs: number };

export interface SearchError {
  error:
    | 'bad_request'
    | 'rate_limited'
    | 'capacity'
    | 'invalid_domain'
    | 'not_found'
    | 'server_error';
  message?: string;
  retryAfterSec?: number;
}

// Response shape for the on-demand reveal route.
export interface RevealResult {
  email: string | null;
  phone?: string | null;
  source: 'company-enrich' | 'contactout' | null;
}
