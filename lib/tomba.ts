// Tomba endpoint wrappers + mappers. Field mappings are derived from real
// Tomba responses (see product spec). Every mapper is defensive: Tomba freely
// returns null/empty fields, so we coalesce hard.

import { callOrthogonal } from './orthogonal';
import type {
  Company,
  Competitor,
  Counts,
  DeptCount,
  Employee,
  LocationCount,
  SocialLinks,
} from './types';

const API = 'tomba';

// ---------------------------------------------------------------------------
// Raw response shapes (only the fields we read)
// ---------------------------------------------------------------------------
interface RawCompaniesFind {
  data?: {
    name?: string | null;
    legalName?: string | null;
    domain?: string | null;
    description?: string | null;
    foundedYear?: string | null;
    location?: string | null;
    type?: string | null;
    emailProvider?: string | null;
    logo?: string | null;
    tags?: string[] | null;
    geo?: {
      city?: string | null;
      state?: string | null;
      country?: string | null;
      countryCode?: string | null;
    } | null;
    metrics?: {
      employees?: string | null;
      annualRevenue?: string | null;
      estimatedAnnualRevenue?: string | null;
    } | null;
    category?: { industry?: string | null; subIndustry?: string | null } | null;
    facebook?: { handle?: string | null } | null;
    linkedin?: { handle?: string | null } | null;
    twitter?: { handle?: string | null } | null;
    tech?: string[] | null;
  } | null;
}

interface RawEmailCount {
  data?: {
    total?: number;
    personal_emails?: number;
    generic_emails?: number;
    department?: Record<string, number> | null;
    seniority?: Record<string, number> | null;
  } | null;
}

interface RawSimilarItem {
  website_url?: string | null;
  name?: string | null;
  industries?: string | null;
}
interface RawSimilar {
  data?: RawSimilarItem[] | null;
}

interface RawLocationItem {
  name?: string | null;
  total?: number | null;
}
interface RawLocation {
  data?: RawLocationItem[] | null;
}

interface RawDomainSearch {
  data?: {
    organization?: {
      website_url?: string | null;
      organization?: string | null;
      industries?: string | null;
      founded?: string | null;
      company_size?: string | null;
      company_type?: string | null;
      revenue?: string | null;
      description?: string | null;
      pattern?: string | null;
      accept_all?: boolean | null;
      last_updated?: string | null;
      location?: {
        country?: string | null;
        city?: string | null;
        state?: string | null;
      } | null;
      social_links?: {
        twitter_url?: string | null;
        facebook_url?: string | null;
        linkedin_url?: string | null;
        instagram_url?: string | null;
        github_url?: string | null;
        youtube_url?: string | null;
      } | null;
    } | null;
    emails?: Array<{
      email?: string | null;
      first_name?: string | null;
      last_name?: string | null;
      full_name?: string | null;
      position?: string | null;
      department?: string | null;
      seniority?: string | null;
      twitter?: string | null;
      linkedin?: string | null;
      country?: string | null;
      score?: number | null;
      verification?: { status?: string | null } | null;
    }> | null;
  } | null;
  meta?: { total?: number | null } | null;
}

interface RawSuggestions {
  data?: Array<{ domain?: string | null; organization?: string | null }> | string[] | null;
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------
export const findCompany = (domain: string) =>
  callOrthogonal<RawCompaniesFind>(API, '/v1/companies/find', { domain });

export const emailCount = (domain: string) =>
  callOrthogonal<RawEmailCount>(API, '/v1/email-count', { domain });

export const similar = (domain: string) =>
  callOrthogonal<RawSimilar>(API, '/v1/similar', { domain });

export const locationDist = (domain: string) =>
  callOrthogonal<RawLocation>(API, '/v1/location', { domain });

export const domainSearch = (domain: string, limit = 50) =>
  callOrthogonal<RawDomainSearch>(API, '/v1/domain-search', { domain, limit });

export async function resolveNameToDomain(name: string): Promise<string | null> {
  const res = await callOrthogonal<RawSuggestions>(API, '/v1/domain-suggestions', { company: name });
  const data = res?.data;
  if (!data) return null;
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0];
    if (typeof first === 'string') return first.toLowerCase();
    if (first && typeof first === 'object') return (first.domain ?? null)?.toLowerCase() ?? null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Extra org fields that live on the domain-search response (accept_all,
// email pattern, full social URLs). Merged into the company at assembly time.
// ---------------------------------------------------------------------------
export interface OrgExtras {
  acceptAll: boolean;
  pattern: string | null;
  socials: SocialLinks;
  lastUpdated: string | null;
  hqLocation: string | null;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------
function handleUrl(base: string, handle?: string | null): string | null {
  if (!handle) return null;
  const h = handle.replace(/^@/, '').trim();
  return h ? `${base}${h}` : null;
}

function locationLabel(parts: Array<string | null | undefined>): string | null {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const v = (p ?? '').trim();
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      out.push(v);
    }
  }
  return out.length ? out.join(', ') : null;
}

export function mapCompany(raw: RawCompaniesFind, domain: string): Company {
  const d = raw?.data ?? {};
  const industries: string[] = [];
  if (d.category?.industry) industries.push(d.category.industry);
  if (d.category?.subIndustry && d.category.subIndustry !== d.category.industry)
    industries.push(d.category.subIndustry);
  for (const t of d.tags ?? []) if (t && industries.length < 6) industries.push(t);

  return {
    name: d.name || d.legalName || domain,
    domain: d.domain || domain,
    description: d.description ?? null,
    website: `https://${d.domain || domain}`,
    founded: d.foundedYear ?? null,
    size: d.metrics?.employees ?? null,
    revenue: d.metrics?.annualRevenue ?? d.metrics?.estimatedAnnualRevenue ?? null,
    type: d.type ?? null,
    industries: Array.from(new Set(industries)),
    hqLocation: locationLabel([d.geo?.city, d.geo?.state, d.geo?.country || d.location]),
    emailPattern: null,
    emailProvider: d.emailProvider ?? null,
    logo: d.logo ?? null,
    socials: {
      twitter: handleUrl('https://twitter.com/', d.twitter?.handle),
      linkedin: handleUrl('https://www.linkedin.com/company/', d.linkedin?.handle),
      facebook: handleUrl('https://www.facebook.com/', d.facebook?.handle),
    },
    tech: (d.tech ?? []).filter(Boolean).slice(0, 24),
    acceptAll: false,
    lastUpdated: null,
  };
}

export function mapOrgExtras(raw: RawDomainSearch): OrgExtras | null {
  const o = raw?.data?.organization;
  if (!o) return null;
  const s = o.social_links ?? {};
  return {
    acceptAll: Boolean(o.accept_all),
    pattern: o.pattern ?? null,
    socials: {
      twitter: s.twitter_url ?? null,
      linkedin: s.linkedin_url ?? null,
      facebook: s.facebook_url ?? null,
      github: s.github_url ?? null,
      instagram: s.instagram_url ?? null,
      youtube: s.youtube_url ?? null,
    },
    lastUpdated: o.last_updated ?? null,
    hqLocation: locationLabel([o.location?.city, o.location?.state, o.location?.country]),
  };
}

/** Merge domain-search org extras into the base company profile. */
export function mergeCompany(base: Company, org: OrgExtras | null): Company {
  if (!org) return base;
  const socials: SocialLinks = { ...base.socials };
  for (const k of Object.keys(org.socials) as (keyof SocialLinks)[]) {
    socials[k] = socials[k] || org.socials[k] || null;
  }
  return {
    ...base,
    acceptAll: org.acceptAll || base.acceptAll,
    emailPattern: base.emailPattern || org.pattern,
    socials,
    hqLocation: base.hqLocation || org.hqLocation,
    lastUpdated: base.lastUpdated || org.lastUpdated,
  };
}

const DEPT_LABELS: Record<string, string> = {
  hr: 'HR',
  it: 'IT',
  pr: 'PR',
};
function titleCase(s: string): string {
  return DEPT_LABELS[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
}

export function mapCounts(raw: RawEmailCount): Counts | null {
  const d = raw?.data;
  if (!d) return null;
  const toList = (obj?: Record<string, number> | null): DeptCount[] =>
    Object.entries(obj ?? {})
      .filter(([, v]) => (v ?? 0) > 0)
      .map(([name, count]) => ({ name: titleCase(name), count }))
      .sort((a, b) => b.count - a.count);
  return {
    total: d.total ?? 0,
    personalEmails: d.personal_emails ?? 0,
    genericEmails: d.generic_emails ?? 0,
    departments: toList(d.department),
    seniority: toList(d.seniority),
  };
}

export function mapCompetitors(raw: RawSimilar): Competitor[] {
  return (raw?.data ?? [])
    .filter((c) => c?.website_url)
    .map((c) => ({
      domain: (c.website_url as string).toLowerCase(),
      name: c.name ?? null,
      industries: c.industries ?? null,
    }));
}

export function mapLocations(raw: RawLocation): LocationCount[] {
  // Tomba returns case-variant duplicates (e.g. "us" and "US"). Merge by
  // uppercased ISO code and sum.
  const merged = new Map<string, number>();
  for (const item of raw?.data ?? []) {
    const code = (item.name ?? '').trim().toUpperCase();
    if (!code) continue;
    merged.set(code, (merged.get(code) ?? 0) + (item.total ?? 0));
  }
  return Array.from(merged.entries())
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count);
}

export function mapEmployees(raw: RawDomainSearch): { employees: Employee[]; totalAvailable: number } {
  const rows = raw?.data?.emails ?? [];
  const employees: Employee[] = rows.map((e) => {
    const status = (e.verification?.status ?? null) as Employee['verified'];
    return {
      email: e.email ?? null,
      firstName: e.first_name ?? null,
      lastName: e.last_name ?? null,
      fullName:
        e.full_name ||
        [e.first_name, e.last_name].filter(Boolean).join(' ') ||
        (e.email ? e.email.split('@')[0] : 'Unknown'),
      title: e.position ?? null,
      department: e.department ? titleCase(e.department) : null,
      seniority: e.seniority ?? null,
      linkedin: e.linkedin ?? null,
      twitter: e.twitter ?? null,
      country: e.country ? e.country.toUpperCase() : null,
      confidence: typeof e.score === 'number' ? e.score : 0,
      verified: status === 'valid' || status === 'invalid' ? status : null,
    };
  });
  employees.sort((a, b) => b.confidence - a.confidence);
  return { employees, totalAvailable: raw?.meta?.total ?? employees.length };
}
