// ContactOut endpoint wrapper.
//   - /v1/people/search  — employee discovery by domain ($0.05 flat, 25 profiles)
//   - /v1/linkedin/enrich — on-demand email/phone reveal by LinkedIn URL ($0.55)
// Decision-makers now come from Company Enrich (see lib/companyenrich.ts) — the
// ContactOut decision-makers endpoint had poor domain coverage (e.g. it returned
// an acquired company's team for figma.com).

import { callOrthogonal } from './orthogonal';
import { deptLabel } from './companyenrich';
import { countryCode } from './format';
import type { Employee } from './types';

const API = 'contactout';

// ---------------------------------------------------------------------------
// Raw response shapes (only the fields we read)
// ---------------------------------------------------------------------------

// /v1/people/search returns a dict keyed by LinkedIn URL.
interface RawCoProfile {
  li_vanity?: string | null;
  full_name?: string | null;
  title?: string | null;
  location?: string | null;
  country?: string | null;       // English country name, e.g. "United States"
  profile_picture_url?: string | null;
  seniority?: string | null;     // e.g. "c-suite", "manager"
  job_function?: string | null;  // e.g. "Engineering"
  contact_availability?: { work_email?: boolean | null } | null;
}

interface RawCoSearch {
  profiles?: Record<string, RawCoProfile> | null;
  metadata?: { page?: number; page_size?: number; total_results?: number } | null;
}

// /v1/linkedin/enrich nests contact arrays under `profile`, with SINGULAR field
// names (work_email, personal_email, phone) — each is a string[].
interface RawProfileContact {
  email?: string[] | null;
  work_email?: string[] | null;
  personal_email?: string[] | null;
  phone?: string[] | null;
}

interface RawLinkedinEnrich {
  profile?: RawProfileContact | null;
}

// Titles that suggest a non-employee relationship (investor, board, advisor).
// Only matched against ContactOut title field, not department (same as CE filter).
const SKIP_CO_TITLE =
  /\b(investor|board\s+member|board\s+of\s+directors|advisor|trustee|angel\s+investor|venture\s+partner|limited\s+partner)\b/i;

// ---------------------------------------------------------------------------
// People search
// ---------------------------------------------------------------------------

/** Discover employees for a domain via ContactOut people search ($0.05 flat, 25 profiles). */
export const searchPeople = (domain: string, page = 1) =>
  callOrthogonal<RawCoSearch>(
    API,
    '/v1/people/search',
    { domain: [domain], reveal_info: false, page },
    'POST',
  );

export function mapContactOutPeople(raw: RawCoSearch | null): Employee[] {
  if (!raw?.profiles) return [];
  const out: Employee[] = [];
  for (const [linkedinUrl, p] of Object.entries(raw.profiles)) {
    if (!p) continue;
    const fullName = (p.full_name ?? '').replace(/\s+/g, ' ').trim();
    if (!fullName) continue;
    if (p.title && SKIP_CO_TITLE.test(p.title)) continue;
    const parts = fullName.split(' ');
    const firstName = parts[0] ?? null;
    const lastName = parts.length > 1 ? parts.slice(1).join(' ') : null;
    // Drop profiles where last name is a single character — ContactOut returns
    // these when the full last name isn't in the index ("Paul D", "Jason L").
    if (lastName !== null && lastName.length === 1) continue;
    out.push({
      ceId: null, // ContactOut rows have no CE id
      firstName,
      lastName,
      fullName,
      title: p.title?.trim() ?? null,
      department: deptLabel(p.job_function),
      seniority: p.seniority?.toLowerCase() || null,
      linkedin: linkedinUrl || (p.li_vanity ? `https://linkedin.com/in/${p.li_vanity}` : null),
      country: countryCode(p.country) ?? (p.country ? p.country.slice(0, 2).toUpperCase() : null),
      location: p.location?.trim() ?? null,
      photo: p.profile_picture_url?.trim() ?? null,
      startedAt: null,
      email: null,
      emailUnverified: false,
      hasContactOutEmail: p.contact_availability?.work_email === true,
      source: 'contactout',
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------
/** Reveal email + phone from a LinkedIn profile URL ($0.55). */
export async function revealByLinkedin(
  profile: string,
): Promise<{ email: string | null; phone: string | null }> {
  const res = await callOrthogonal<RawLinkedinEnrich>(
    API,
    '/v1/linkedin/enrich',
    { profile },
    'GET',
  );
  const p = res?.profile ?? null;
  const email = p?.work_email?.[0] ?? p?.email?.[0] ?? p?.personal_email?.[0] ?? null;
  const phone = p?.phone?.[0] ?? null;
  return { email, phone };
}
