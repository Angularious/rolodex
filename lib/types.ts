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
  valuation?: string | null; // human label, e.g. "$35B"
  description?: string | null; // short narrative from Fundable deal_descriptions
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

/** One entry from Tomba's /v1/email-format response. */
export interface FormatPattern {
  format: string;     // e.g. "{first}.{last}"
  percentage: number; // dominant pattern's confidence, e.g. 98
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
  // True when ContactOut has a work email on file (contact_availability.work_email).
  // Only set on ContactOut rows; undefined/false otherwise.
  hasContactOutEmail?: boolean;
  // Provenance — drives confidence badge in the UI.
  // company-enrich: LinkedIn-verified, ceId for cheap reveals
  // contactout:     quality profile, photo, LinkedIn; no inline email
  // tomba:          pattern/unverified inline email, weaker identity signal
  source?: 'company-enrich' | 'contactout' | 'tomba';
}

/** A web signal (news, product launch, customer mention) from Seltz search. */
export interface Signal {
  url: string;
  title: string | null;
  snippet: string | null;
  source: string | null; // hostname without www
  category: 'funding' | 'product' | 'customer' | 'general';
}

/** A job posting link from Seltz search — shown in the Departments tab. */
export interface JobSignal {
  url: string;
  title: string | null;
  snippet: string | null;
  source: string | null;
}

// NDJSON stream message types emitted by /api/search
export type StreamMessage =
  | { type: 'meta'; domain: string; resolvedFrom?: string | null }
  | { type: 'company'; data: Company | null; error?: string }
  | { type: 'workforce'; data: Workforce | null; error?: string }
  | { type: 'competitors'; data: Competitor[] | null; error?: string }
  | { type: 'employees'; data: Employee[]; totalAvailable: number; error?: string }
  | { type: 'emailformat'; patterns: FormatPattern[] }
  | { type: 'signals'; data: Signal[] | null; error?: string }
  | { type: 'jobs'; data: JobSignal[] | null; error?: string }
  | { type: 'narrative'; description: string }
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

/** One email hit from the multi-source reveal route. */
export interface EmailHit {
  email: string;
  source: 'company-enrich' | 'apollo' | 'contactout';
}

// Response shape for the on-demand reveal route.
export interface RevealResult {
  emails: EmailHit[];
  phone: string | null;
}
