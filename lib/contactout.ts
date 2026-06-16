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

interface RawContactInfo {
  emails?: string[] | null;
  work_emails?: string[] | null;
  personal_emails?: string[] | null;
  phones?: string[] | null;
}

interface RawLinkedinEnrich {
  contact_info?: RawContactInfo | null;
  // some shapes nest the profile under a single-key map; be defensive
  profiles?: Record<string, { contact_info?: RawContactInfo | null }> | null;
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
  let info = res?.contact_info ?? null;
  if (!info && res?.profiles) {
    const first = Object.values(res.profiles)[0];
    info = first?.contact_info ?? null;
  }
  const email =
    info?.work_emails?.[0] ?? info?.emails?.[0] ?? info?.personal_emails?.[0] ?? null;
  const phone = info?.phones?.[0] ?? null;
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
