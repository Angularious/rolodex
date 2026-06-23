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
import type { Competitor, Employee, FormatPattern } from './types';

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

// --------------------------------------------------------------- email-format
interface RawEmailFormat {
  data?: Array<{ format?: string | null; percentage?: number | null }> | null;
}

/** Returns the dominant email patterns for a domain (flat $0.01). */
export const emailFormat = (domain: string) =>
  callOrthogonal<RawEmailFormat>(API, '/v1/email-format', { domain });

export function mapEmailFormat(raw: RawEmailFormat): FormatPattern[] {
  return (raw?.data ?? [])
    .filter((p): p is { format: string; percentage: number } =>
      typeof p?.format === 'string' && typeof p?.percentage === 'number',
    )
    .sort((a, b) => b.percentage - a.percentage);
}

export function mapCompetitors(raw: RawSimilar): Competitor[] {
  return (raw?.data ?? [])
    .filter((c) => c?.website_url && c?.name)
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
  type?: string | null; // tomba: 'personal' | 'generic' (unreliable — see isRealPerson)
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

// Role / department / program mailboxes that aren't a real person — matched on
// the email local-part (before @, ignoring dots/dashes/underscores and +tags).
// Tomba's `type` field is unreliable (it labels help@-style inboxes "personal"),
// so we filter by mailbox name + name quality instead.
const ROLE_MAILBOX = new Set([
  'help', 'helpdesk', 'support', 'info', 'information', 'contact', 'contactus', 'hello',
  'hi', 'hey', 'ask', 'admin', 'administrator', 'sales', 'presales', 'team', 'careers',
  'career', 'jobs', 'job', 'recruiting', 'recruitment', 'hr', 'press', 'media', 'pr',
  'marketing', 'billing', 'invoices', 'invoice', 'accounts', 'accounting', 'finance',
  'legal', 'privacy', 'security', 'abuse', 'compliance', 'noreply', 'donotreply',
  'mail', 'mailer', 'office', 'enquiries', 'inquiries', 'enquiry', 'feedback',
  'newsletter', 'news', 'notifications', 'notification', 'service', 'services',
  'webmaster', 'postmaster', 'sysadmin', 'it', 'dev', 'developers', 'developer', 'api',
  'partners', 'partner', 'partnerships', 'events', 'event', 'community', 'customer',
  'customers', 'customerservice', 'customersuccess', 'orders', 'order', 'shop', 'store',
  'subscribe', 'unsubscribe', 'bounce', 'general', 'main', 'official', 'team-us',
]);

export function isRoleEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const local = email.split('@')[0].toLowerCase().split('+')[0];
  if (local.length < 2) return true; // single-char local-part (e.g. r@spacex.com) → role/catch-all
  if (ROLE_MAILBOX.has(local)) return true;
  if (ROLE_MAILBOX.has(local.replace(/[._-]/g, ''))) return true;
  return false;
}

// Keep only rows that look like a real individual. A real profile has a proper
// human name (first + at least an initial, OR a 2-token full_name) and is not a
// role mailbox. This drops Tomba noise like `ukpublicsectoragreement@` (no name)
// while keeping `callum@` → "Callum M" (first + initial, has a LinkedIn).
//
// NOTE: we deliberately do NOT trust Tomba's `type` field — it's wrong in both
// directions (it tags Figma's CEO `dylan@figma.com` "generic" but a program
// inbox "personal"). Name quality + the role-mailbox blocklist are the signal.
function isRealPerson(p: RawTombaPerson): boolean {
  if (isRoleEmail(p.email)) return false;
  const first = (p.first_name ?? '').trim();
  const last = (p.last_name ?? '').trim();
  const fullTokens = (p.full_name ?? '').trim().split(/\s+/).filter(Boolean);
  return (first.length >= 2 && last.length >= 1) || fullTokens.length >= 2;
}

export function mapTombaEmployees(raw: RawDomainSearch, domain?: string): Employee[] {
  const out: Employee[] = [];
  const seen = new Set<string>();
  for (const p of raw?.data?.emails ?? []) {
    if (!isRealPerson(p)) continue; // drop role mailboxes / nameless / program inboxes
    // Drop rows whose email domain doesn't match the searched domain — Tomba can
    // return employees from a same-named company (e.g. plaid.co.jp for plaid.com).
    if (domain && p.email) {
      const emailDomain = p.email.split('@')[1]?.toLowerCase();
      if (emailDomain && emailDomain !== domain.toLowerCase()) continue;
    }
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
  // Prefer profiles that carry a LinkedIn when filling the list (higher-signal,
  // and answers "get us their LinkedIns too"). Stable otherwise.
  return out.sort((a, b) => (a.linkedin ? 0 : 1) - (b.linkedin ? 0 : 1));
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

/**
 * Three-source merge: CE (highest quality) → ContactOut → Tomba filler.
 *
 * Strategy:
 *   1. Build a Tomba email index by normalized LinkedIn URL so ContactOut rows
 *      that share a LinkedIn get a free Tomba email injected (unverified).
 *   2. Add all CE rows (they have ceId for cheap verified reveals).
 *   3. Add ContactOut rows not already in CE (dedup by LinkedIn then name),
 *      enriching each with a Tomba pattern email where the LinkedIn matches.
 *   4. Fill remaining slots with Tomba-only rows (no CE/CO match).
 */
export function mergeAllEmployees(
  ce: Employee[],
  co: Employee[],
  tomba: Employee[],
  cap: number,
): Employee[] {
  // Index Tomba rows by normalized LinkedIn for email enrichment of CO rows.
  const tombaByLinkedin = new Map<string, Employee>();
  for (const t of tomba) {
    const lk = normLinkedin(t.linkedin);
    if (lk) tombaByLinkedin.set(lk, t);
  }

  const seenLink = new Set<string>();
  const seenName = new Set<string>();

  // Step 1: seed seen sets with CE rows.
  for (const e of ce) {
    const lk = normLinkedin(e.linkedin);
    if (lk) seenLink.add(lk);
    seenName.add(nameKey(e.fullName));
  }
  const merged = [...ce];

  // Step 2: add ContactOut rows not in CE, optionally enriched with Tomba email.
  for (const c of co) {
    if (merged.length >= cap) break;
    const lk = normLinkedin(c.linkedin);
    const nk = nameKey(c.fullName);
    if ((lk && seenLink.has(lk)) || seenName.has(nk)) continue;
    if (lk) seenLink.add(lk);
    seenName.add(nk);
    // Enrich with Tomba pattern email if LinkedIn matches.
    const tombaMatch = lk ? tombaByLinkedin.get(lk) : undefined;
    merged.push(
      tombaMatch?.email
        ? { ...c, email: tombaMatch.email, emailUnverified: true }
        : c,
    );
  }

  // Step 3: fill remaining slots with Tomba-only rows.
  for (const t of tomba) {
    if (merged.length >= cap) break;
    const lk = normLinkedin(t.linkedin);
    const nk = nameKey(t.fullName);
    if ((lk && seenLink.has(lk)) || seenName.has(nk)) continue;
    if (lk) seenLink.add(lk);
    seenName.add(nk);
    merged.push(t);
  }

  return merged.slice(0, cap);
}
