import { NextRequest } from 'next/server';
import { clientIp, hashIp } from '@/lib/hash';
import { checkRateLimit } from '@/lib/ratelimit';
import { reserveSpend, reconcileSpend } from '@/lib/spend';
import { originAllowed, isBotUserAgent } from '@/lib/guard';
import { resolveWorkEmail } from '@/lib/companyenrich';
import { revealByLinkedin } from '@/lib/contactout';
import { isQuotaError } from '@/lib/orthogonal';
import type { RevealResult, SearchError } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const PRICE = {
  ceEmail: 0.1225, // company-enrich /people/email
  contactout: 0.55, // contactout /v1/linkedin/enrich
};

// Worst-case: both tiers run. Reserved up front, reconciled to the real cost.
const ESTIMATE_USD = PRICE.ceEmail + PRICE.contactout;

function errorResponse(err: SearchError, status: number): Response {
  return new Response(JSON.stringify(err), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * On-demand email/phone reveal for a single person. Tiered:
 *   1. Company Enrich /people/email by CompanyEnrich id ($0.12, work email only)
 *   2. fall back to ContactOut /v1/linkedin/enrich ($0.55, email + phone)
 * Gated identically to /api/search (origin lock, rate limit, spend cap) and
 * billed against the same daily ledger. Nothing is persisted (data policy).
 */
export async function POST(req: NextRequest) {
  if (!originAllowed(req)) {
    return errorResponse({ error: 'bad_request', message: 'Cross-origin requests are not allowed.' }, 403);
  }
  if (isBotUserAgent(req)) {
    return errorResponse({ error: 'bad_request', message: 'Unsupported client.' }, 403);
  }

  const body = (await req.json().catch(() => null)) as {
    domain?: string;
    ceId?: string;
    linkedin?: string;
  } | null;
  if (!body || (!body.ceId && !body.linkedin)) {
    return errorResponse({ error: 'bad_request' }, 400);
  }

  const idHash = await hashIp(clientIp(req.headers));

  const rl = await checkRateLimit(idHash);
  if (!rl.ok) {
    return errorResponse({ error: 'rate_limited', retryAfterSec: rl.retryAfterSec }, 429);
  }
  // Atomic hard-cap reservation (worst case = both tiers); reconciled below.
  const reservation = await reserveSpend(ESTIMATE_USD);
  if (!reservation.allowed) {
    return errorResponse({ error: 'capacity' }, 503);
  }

  let spentUsd = 0;
  const result: RevealResult = { email: null, phone: null, source: null };

  try {
    // Tier 1 — cheap work-email resolution (needs a CompanyEnrich person id).
    if (body.ceId) {
      spentUsd += PRICE.ceEmail;
      const email = await resolveWorkEmail(body.ceId, body.domain);
      if (email) {
        result.email = email;
        result.source = 'company-enrich';
      }
    }

    // Tier 2 — ContactOut by LinkedIn (broader coverage + phone).
    if (!result.email && body.linkedin) {
      spentUsd += PRICE.contactout;
      const { email, phone } = await revealByLinkedin(body.linkedin);
      if (email || phone) {
        result.email = email;
        result.phone = phone;
        result.source = 'contactout';
      }
    }
  } catch (err) {
    // Reconcile whatever we actually spent before failing, then report cleanly.
    await reconcileSpend(spentUsd - ESTIMATE_USD);
    // Key hit its limit → capacity, so the client can message it consistently.
    if (isQuotaError(err)) return errorResponse({ error: 'capacity' }, 503);
    return errorResponse({ error: 'server_error', message: 'Reveal failed.' }, 502);
  }

  await reconcileSpend(spentUsd - ESTIMATE_USD);

  return new Response(JSON.stringify(result), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
