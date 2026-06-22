// ContactOut endpoint wrapper for on-demand email/phone reveal (by LinkedIn URL).
// Decision-makers now come from Company Enrich (see lib/companyenrich.ts) — the
// ContactOut decision-makers endpoint had poor domain coverage (e.g. it returned
// an acquired company's team for figma.com).

import { callOrthogonal } from './orthogonal';

const API = 'contactout';

// ---------------------------------------------------------------------------
// Raw response shapes (only the fields we read)
// ---------------------------------------------------------------------------
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
