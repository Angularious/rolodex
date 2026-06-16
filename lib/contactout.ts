// ContactOut endpoint wrappers + mappers. Used for the decision-makers section
// (real senior contacts with coverage flags) and on-demand email/phone reveal.

import { callOrthogonal } from './orthogonal';
import type { DecisionMaker } from './types';

const API = 'contactout';

// ---------------------------------------------------------------------------
// Raw response shapes (only the fields we read)
// ---------------------------------------------------------------------------
interface RawDecisionMakerProfile {
  li_vanity?: string | null;
  full_name?: string | null;
  title?: string | null;
  headline?: string | null;
  location?: string | null;
  country?: string | null;
  seniority?: string | null;
  job_function?: string | null;
  contact_availability?: {
    work_email?: boolean | null;
    personal_email?: boolean | null;
    phone?: boolean | null;
  } | null;
}

interface RawDecisionMakers {
  profiles?: Record<string, RawDecisionMakerProfile> | null;
  metadata?: { total_results?: number | null } | null;
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

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------
/**
 * Decision-makers at a domain. `reveal_info=false` keeps this a flat $0.05 call
 * regardless of per_page, and returns per-person contact-availability flags so
 * the UI can show coverage before anyone pays to reveal.
 */
export const decisionMakers = (domain: string, perPage = 25) =>
  callOrthogonal<RawDecisionMakers>(
    API,
    '/v1/people/decision-makers',
    { domain, reveal_info: false, per_page: perPage },
    'GET',
  );

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

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------
export function mapDecisionMakers(raw: RawDecisionMakers): DecisionMaker[] {
  const profiles = raw?.profiles ?? {};
  return Object.entries(profiles).map(([linkedinKey, p]) => {
    const ca = p.contact_availability ?? {};
    const linkedin =
      linkedinKey ||
      (p.li_vanity ? `https://www.linkedin.com/in/${p.li_vanity}` : null);
    return {
      name: p.full_name || p.li_vanity || 'Unknown',
      title: p.title ?? null,
      headline: p.headline ?? null,
      location: p.location ?? null,
      country: p.country ?? null,
      seniority: p.seniority ?? null,
      jobFunction: p.job_function ?? null,
      linkedin,
      hasWorkEmail: Boolean(ca.work_email),
      hasPersonalEmail: Boolean(ca.personal_email),
      hasPhone: Boolean(ca.phone),
      email: null,
      phone: null,
    };
  });
}
