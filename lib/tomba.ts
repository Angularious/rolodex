// Tomba is used for two cheap (flat $0.01) lookups:
//   1. /v1/similar       — "similar companies" (competitors). CE's similar
//      endpoint costs ~$0.06/result and competitors aren't the quality pain
//      point, so we keep this one.
//   2. /v1/domain-search — an employee directory (up to 50) with inline emails,
//      used to AUGMENT the CE people-search list (which is verified-capable but
//      often thin). Tomba rows are lower-confidence: emails are unverified
//      pattern guesses and there's NO photo / city / ceId. We mark them so the
//      UI labels the email "unverified", dedupe them against CE, and only use
//      them to fill out a short list.
// Verified company/people/email sourcing still lives in lib/companyenrich.ts +
// lib/contactout.ts.

import { callOrthogonal } from './orthogonal';
import { deptLabel } from './companyenrich';
import type { Competitor, Employee } from './types';

const API = 'tomba';

interface RawSimilarItem {
  website_url?: string | null;
  name?: string | null;
  industries?: string | null;
}
interface RawSimilar {
  data?: RawSimilarItem[] | null;
}

export const similar = (domain: string) =>
  callOrthogonal<RawSimilar>(API, '/v1/similar', { domain });

export function mapCompetitors(raw: RawSimilar): Competitor[] {
  return (raw?.data ?? [])
    .filter((c) => c?.website_url)
    .map((c) => ({
      domain: (c.website_url as string).toLowerCase(),
      name: c.name ?? null,
      industries: c.industries ?? null,
    }));
}

// --------------------------------------------------------------- domain-search
interface RawTombaPerson {
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  position?: string | null;
  department?: string | null;
  seniority?: string | null;
  linkedin?: string | null;
  country?: string | null;
}
interface RawDomainSearch {
  // Tomba wraps its payload in a top-level `data` (like /v1/similar).
  data?: { emails?: RawTombaPerson[] | null } | null;
}

/** Employee directory for a domain (flat $0.01, up to 50). `company` is a
 *  required 3-75 char name; callers pass the resolved name or a domain root. */
export const domainSearch = (domain: string, company: string, limit = 50) =>
  callOrthogonal<RawDomainSearch>(API, '/v1/domain-search', { domain, company, limit });

// Tomba positions arrive mixed-case ("software engineer" vs "Data Scientist");
// title-case the all-lowercase ones so they sit consistently next to CE titles.
function tidyTitle(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!t) return null;
  return t === t.toLowerCase()
    ? t.replace(/\b\w/g, (c) => c.toUpperCase())
    : t;
}

export function mapTombaEmployees(raw: RawDomainSearch): Employee[] {
  const out: Employee[] = [];
  const seen = new Set<string>();
  for (const p of raw?.data?.emails ?? []) {
    const fullName =
      p.full_name?.trim() || [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
    if (!fullName) continue;
    const key = personKey(p.linkedin, fullName);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      ceId: null, // no CE id → no cheap verified-email path for these rows
      firstName: p.first_name ?? null,
      lastName: p.last_name ?? null,
      fullName,
      title: tidyTitle(p.position),
      department: deptLabel(p.department),
      seniority: p.seniority ?? null,
      linkedin: p.linkedin ?? null,
      country: p.country ? p.country.toUpperCase() : null,
      location: null, // Tomba returns country only — no city/address
      photo: null, // Tomba returns no photo
      startedAt: null,
      email: p.email ?? null,
      emailUnverified: true,
      source: 'tomba',
    });
  }
  return out;
}

// --------------------------------------------------------------- dedup / merge
function normLinkedin(url?: string | null): string | null {
  if (!url) return null;
  const v = url
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('?')[0]
    .replace(/\/+$/, '');
  return v || null;
}
function nameKey(name?: string | null): string {
  return (name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function personKey(linkedin?: string | null, name?: string | null): string {
  return normLinkedin(linkedin) ?? `name:${nameKey(name)}`;
}

/**
 * CE-first merge: keep all CE employees, then append Tomba rows that CE does
 * NOT already have (matched by normalized LinkedIn URL OR normalized full name),
 * up to `cap`. Guarantees no Tomba row duplicates a CE profile.
 */
export function mergeEmployees(ce: Employee[], tomba: Employee[], cap: number): Employee[] {
  const seenLink = new Set<string>();
  const seenName = new Set<string>();
  for (const e of ce) {
    const lk = normLinkedin(e.linkedin);
    if (lk) seenLink.add(lk);
    seenName.add(nameKey(e.fullName));
  }
  const merged = [...ce];
  for (const t of tomba) {
    if (merged.length >= cap) break;
    const lk = normLinkedin(t.linkedin);
    const nk = nameKey(t.fullName);
    if ((lk && seenLink.has(lk)) || seenName.has(nk)) continue; // already a CE/added row
    if (lk) seenLink.add(lk);
    seenName.add(nk);
    merged.push(t);
  }
  return merged.slice(0, cap);
}
