// Shared types for the company intelligence report.

export interface SocialLinks {
  twitter?: string | null;
  linkedin?: string | null;
  facebook?: string | null;
  github?: string | null;
  instagram?: string | null;
  youtube?: string | null;
}

export interface Company {
  name: string;
  domain: string;
  description?: string | null;
  website: string;
  founded?: string | null;
  size?: string | null;
  revenue?: string | null;
  type?: string | null;
  industries: string[];
  hqLocation?: string | null;
  emailPattern?: string | null;
  emailProvider?: string | null;
  logo?: string | null;
  socials: SocialLinks;
  tech: string[];
  acceptAll: boolean;
  lastUpdated?: string | null;
}

export interface DeptCount {
  name: string;
  count: number;
}

export interface Counts {
  total: number;
  personalEmails: number;
  genericEmails: number;
  departments: DeptCount[];
  seniority: DeptCount[];
}

export interface Competitor {
  domain: string;
  name?: string | null;
  industries?: string | null;
}

export interface LocationCount {
  country: string; // ISO-2 uppercased
  count: number;
}

export interface Employee {
  email: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName: string;
  title?: string | null;
  department?: string | null;
  seniority?: string | null;
  linkedin?: string | null;
  twitter?: string | null;
  country?: string | null;
  confidence: number; // 0-100
  verified?: 'valid' | 'invalid' | null;
}

// NDJSON stream message types emitted by /api/search
export type StreamMessage =
  | { type: 'meta'; domain: string; cached: { company: boolean; employees: boolean }; resolvedFrom?: string | null }
  | { type: 'company'; data: Company | null; error?: string }
  | { type: 'counts'; data: Counts | null; error?: string }
  | { type: 'competitors'; data: Competitor[] | null; error?: string }
  | { type: 'locations'; data: LocationCount[] | null; error?: string }
  | { type: 'employees'; data: Employee[]; totalAvailable: number; error?: string }
  | { type: 'done'; cost: number; durationMs: number };

export interface SearchError {
  error:
    | 'bad_request'
    | 'captcha_failed'
    | 'rate_limited'
    | 'capacity'
    | 'invalid_domain'
    | 'not_found'
    | 'server_error';
  message?: string;
  retryAfterSec?: number;
}
