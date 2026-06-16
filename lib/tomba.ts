// Tomba is retained for ONE thing only: the cheap "similar companies" lookup
// ($0.01). Company Enrich's similar endpoint costs ~$0.06/result, and
// competitors aren't the data-quality pain point, so we keep this one call.
// All company/people/email sourcing moved to lib/companyenrich.ts +
// lib/contactout.ts.

import { callOrthogonal } from './orthogonal';
import type { Competitor } from './types';

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
