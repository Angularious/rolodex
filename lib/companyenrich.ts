// Company Enrich endpoint wrappers + mappers. Field mappings are derived from
// real Company Enrich responses. Every mapper is defensive: fields are freely
// null/absent, so we coalesce hard.

import { callOrthogonal } from './orthogonal';
import type {
  Company,
  DeptCount,
  Employee,
  FundingRound,
  SocialLinks,
  Workforce,
  WorkforcePoint,
} from './types';

const API = 'company-enrich';

// ---------------------------------------------------------------------------
// Raw response shapes (only the fields we read)
// ---------------------------------------------------------------------------
interface RawFundingItem {
  date?: string | null;
  amount?: string | null; // e.g. "415749740 USD"
  type?: string | null; // e.g. "Series F - Figma"
  from?: string | null; // investors
}

interface RawCompany {
  id?: string | null;
  name?: string | null;
  domain?: string | null;
  website?: string | null;
  type?: string | null;
  industry?: string | null;
  industries?: string[] | null;
  categories?: string[] | null;
  keywords?: string[] | null;
  employees?: string | null;
  revenue?: string | null;
  description?: string | null;
  technologies?: string[] | null;
  founded_year?: number | string | null;
  location?: {
    country?: { code?: string | null; name?: string | null } | null;
    state?: { name?: string | null; code?: string | null } | null;
    city?: { name?: string | null } | null;
    address?: string | null;
    phone?: string | null;
  } | null;
  financial?: {
    stock_symbol?: string | null;
    total_funding?: number | null;
    funding_stage?: string | null;
    funding_date?: string | null;
    funding?: RawFundingItem[] | null;
  } | null;
  socials?: {
    linkedin_url?: string | null;
    twitter_url?: string | null;
    facebook_url?: string | null;
    instagram_url?: string | null;
    github_url?: string | null;
    youtube_url?: string | null;
    crunchbase_url?: string | null;
    angellist_url?: string | null;
    g2_url?: string | null;
  } | null;
  logo_url?: string | null;
  updated_at?: string | null;
}

interface RawWorkforce {
  company_id?: string | null;
  observed_employee_count?: number | null;
  employee_count_range?: string | null;
  department_headcount?: Record<string, number> | null;
  history?: Array<{
    date?: string | null;
    observed_employee_count?: number | null;
    department_headcount?: Record<string, number> | null;
  }> | null;
}

// One row of a person's experience timeline. `isMatched` flags the experience
// at the SEARCHED company (so its position/department is the role we want to
// show — not the person's headline role, which is often at another company).
interface RawExperience {
  type?: string | null;
  company?: { id?: string | null; name?: string | null; domain?: string | null } | null;
  companyName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isCurrent?: boolean | null;
  isMatched?: boolean | null;
  position?: string | null;
  seniority?: string | null;
  department?: string | null;
}

interface RawPerson {
  id?: number | string | null;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null; // headline/primary role — NOT necessarily at this company
  seniority?: string | null;
  department?: string | null;
  location?: {
    country?: { code?: string | null; name?: string | null } | null;
    address?: string | null;
  } | null;
  socials?: { linkedin_url?: string | null } | null;
  image_url?: string | null;
  experiences?: RawExperience[] | null;
}

interface RawPeopleSearch {
  items?: RawPerson[] | null;
  page?: number | null;
  totalItems?: number | null;
}

interface RawPeopleEmail {
  email?: string | null;
  // some shapes wrap it; be defensive
  data?: { email?: string | null } | null;
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------
/** Profile by domain (GET — signalled by passing `query`). */
export const enrichByDomain = (domain: string) =>
  callOrthogonal<RawCompany>(API, '/companies/enrich', { domain }, 'GET');

/** Profile by name (POST) — also resolves the canonical domain. */
export const enrichByName = (name: string) =>
  callOrthogonal<RawCompany>(API, '/companies/enrich', { name }, 'POST');

/** Fallback profile fetch by CompanyEnrich id (unique GET path). */
export const profileById = (id: string) =>
  callOrthogonal<RawCompany>(API, '/companies', { id }, 'GET');

export const workforce = (domain: string) =>
  callOrthogonal<RawWorkforce>(API, '/companies/workforce', { domain }, 'GET');

export const peopleSearch = (domain: string, pageSize = 25, page = 1) =>
  callOrthogonal<RawPeopleSearch>(
    API,
    '/people/search',
    { domains: [domain], pageSize, page },
    'POST',
  );

/** Resolve a work email for a CompanyEnrich person id (cheap reveal tier). */
export async function resolveWorkEmail(id: string, domain?: string): Promise<string | null> {
  const params: Record<string, unknown> = { id };
  if (domain) params.domain = domain;
  const res = await callOrthogonal<RawPeopleEmail>(API, '/people/email', params, 'GET');
  return res?.email ?? res?.data?.email ?? null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtMoney(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(n % 1e9 === 0 ? 0 : 1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${n}`;
}

function parseAmount(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.replace(/,/g, '').match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
}

function cleanRoundType(t: string | null | undefined): string | null {
  if (!t) return null;
  // Strip a trailing " - CompanyName" decoration Company Enrich appends.
  return t.split(' - ')[0].trim() || null;
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

// Workforce uses snake_case department keys; people-search uses slash-delimited
// taxonomy paths. Both fold down to a short human label so the UI (and the
// click-to-filter on the departments tab) line up.
const DEPT_LABELS: Record<string, string> = {
  c_suite: 'C-Suite',
  'c-suite': 'C-Suite',
  engineering_technical: 'Engineering',
  engineering: 'Engineering',
  product_management: 'Product',
  product: 'Product',
  human_resources: 'HR',
  hr: 'HR',
  information_technology: 'IT',
  it: 'IT',
  medical_health: 'Medical',
  design: 'Design',
  finance: 'Finance',
  legal: 'Legal',
  marketing: 'Marketing',
  sales: 'Sales',
  operations: 'Operations',
  education: 'Education',
  consulting: 'Consulting',
};

function titleCase(s: string): string {
  return s
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function deptLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // people-search uses slash-delimited taxonomy paths with hyphenated segments
  // (e.g. "human-resources/recruiting"); workforce uses snake_case keys. Fold
  // both to the same key so labels (and the departments-tab filter) line up.
  const head = raw.split('/')[0].trim().toLowerCase().replace(/-/g, '_');
  return DEPT_LABELS[head] ?? titleCase(head);
}

// Matched roles that aren't real employment — board seats, advisory, authorship.
// An "Employees" list shouldn't include these (they showed up as noise: board
// members, an "Amazon Best-Selling Author", etc.). Unambiguous phrasings only,
// to avoid dropping real staff.
const NON_EMPLOYEE_ROLE = /\b(board member|board of (directors|trustees)|audit committee|advisory board|advisor|trustee|best.?selling author|council member|investor|venture partner)\b/i;

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------
export function mapCompany(raw: RawCompany, fallbackDomain: string): Company {
  const domain = raw.domain || fallbackDomain;
  const industries: string[] = [];
  if (raw.industry) industries.push(raw.industry);
  for (const i of raw.industries ?? []) {
    if (i && industries.length < 6 && !industries.includes(i)) industries.push(i);
  }

  const f = raw.financial ?? {};
  const rounds: FundingRound[] = (f.funding ?? [])
    .map((r) => ({
      date: r.date ?? null,
      amount: fmtMoney(parseAmount(r.amount)),
      type: cleanRoundType(r.type),
      investors: r.from ?? null,
    }))
    .filter((r) => r.type || r.amount || r.date);

  const s = raw.socials ?? {};
  const socials: SocialLinks = {
    linkedin: s.linkedin_url ?? null,
    twitter: s.twitter_url ?? null,
    facebook: s.facebook_url ?? null,
    instagram: s.instagram_url ?? null,
    github: s.github_url ?? null,
    youtube: s.youtube_url ?? null,
    crunchbase: s.crunchbase_url ?? null,
    angellist: s.angellist_url ?? null,
    g2: s.g2_url ?? null,
  };

  return {
    name: raw.name || domain,
    domain,
    description: raw.description ?? null,
    website: raw.website || `https://${domain}`,
    founded: raw.founded_year != null ? String(raw.founded_year) : null,
    size: raw.employees ?? null,
    revenue: raw.revenue ?? null,
    type: raw.type ?? null,
    industries: Array.from(new Set(industries)),
    categories: (raw.categories ?? []).filter(Boolean),
    hqLocation: locationLabel([
      raw.location?.city?.name,
      raw.location?.state?.name,
      raw.location?.country?.name,
    ]),
    phone: raw.location?.phone ?? null,
    logo: raw.logo_url ?? null,
    socials,
    tech: (raw.technologies ?? []).filter(Boolean).slice(0, 24),
    keywords: (raw.keywords ?? []).filter(Boolean).slice(0, 18),
    fundingTotal: fmtMoney(f.total_funding),
    fundingStage: f.funding_stage ?? null,
    fundingDate: f.funding_date ? f.funding_date.slice(0, 10) : null,
    fundingRounds: rounds,
    stockSymbol: f.stock_symbol ?? null,
    lastUpdated: raw.updated_at ?? null,
  };
}

export function mapWorkforce(raw: RawWorkforce): Workforce | null {
  if (!raw) return null;

  // Per-department headcount change over the history window. The API returns
  // history newest→oldest, and each point carries its own department_headcount,
  // so the oldest point with department detail is the baseline.
  const hist = raw.history ?? [];
  const baseline = [...hist].reverse().find((h) => h.department_headcount)?.department_headcount ?? null;
  const growthSince = baseline ? ([...hist].reverse().find((h) => h.department_headcount)?.date ?? null) : null;
  const deltaFor = (key: string): number | null =>
    baseline ? (raw.department_headcount?.[key] ?? 0) - (baseline[key] ?? 0) : null;

  const departments: DeptCount[] = Object.entries(raw.department_headcount ?? {})
    .filter(([, v]) => (v ?? 0) > 0)
    .map(([name, count]) => ({ name: deptLabel(name) ?? name, count, delta: deltaFor(name) }))
    .sort((a, b) => b.count - a.count);

  const history: WorkforcePoint[] = hist
    .filter((h) => h.date && typeof h.observed_employee_count === 'number')
    .map((h) => ({ date: h.date as string, total: h.observed_employee_count as number }))
    .reverse(); // API returns newest→oldest; we want oldest→newest for a trend

  return {
    total: raw.observed_employee_count ?? departments.reduce((s, d) => s + d.count, 0),
    range: raw.employee_count_range ?? null,
    departments,
    history: history.length > 1 ? history : undefined,
    growthSince: growthSince ? growthSince.slice(0, 7) : null,
  };
}

// The role AT the searched company is the experience CompanyEnrich flags as
// matched — NOT the top-level headline (often a different employer). Returns the
// matched, current, real-employment role, or null if the person doesn't qualify
// (no matched role / explicitly ended / a board/advisor/investor affiliation).
function matchedRole(p: RawPerson): RawExperience | null {
  const matched = (p.experiences ?? []).filter((e) => e.isMatched);
  const role = matched.find((e) => e.isCurrent !== false) ?? matched[0];
  if (!role) return null;
  if (role.isCurrent === false) return null;
  if (NON_EMPLOYEE_ROLE.test(role.position ?? '')) return null;
  return role;
}

export function mapPeople(raw: RawPeopleSearch): {
  employees: Employee[];
  totalAvailable: number;
} {
  const rows = raw?.items ?? [];
  const employees: Employee[] = [];
  const seen = new Set<string>();

  for (const p of rows) {
    // Relevance gate: must hold a current, real-employment role at this company.
    const role = matchedRole(p);
    if (!role) continue;

    // Fields come ONLY from the matched role, so a person's other-company
    // headline can't leak in (the old bug: "founder" for an Amazon recruiter).
    const position = role.position ?? null;
    const seniority = role.seniority ?? null;
    const department = deptLabel(role.department);

    // Dedupe on LinkedIn URL (falls back to id/name) — the feed repeats people.
    const key = (p.socials?.linkedin_url ?? '').toLowerCase() || String(p.id ?? p.name ?? '');
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);

    const code = p.location?.country?.code ? p.location.country.code.toUpperCase() : null;
    employees.push({
      ceId: p.id != null ? String(p.id) : null,
      firstName: p.first_name ?? null,
      lastName: p.last_name ?? null,
      fullName: p.name || [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown',
      title: position,
      department,
      seniority,
      linkedin: p.socials?.linkedin_url ?? null,
      country: code,
      location: p.location?.address ?? p.location?.country?.name ?? null,
      photo: p.image_url ?? null,
      startedAt: role.startDate ?? null,
      email: null,
    });
  }

  return { employees, totalAvailable: raw?.totalItems ?? employees.length };
}

