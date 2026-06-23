import { NextRequest } from 'next/server';
import { clientIp, hashIp } from '@/lib/hash';
import { checkRateLimit } from '@/lib/ratelimit';
import { reserveSpend, reconcileSpend } from '@/lib/spend';
import { originAllowed, isBotUserAgent } from '@/lib/guard';
import {
  readSession,
  sessionExceeded,
  addSessionSpend,
  sessionCookie,
  secondsUntilUtcMidnight,
} from '@/lib/session';
import { resolveWorkEmail } from '@/lib/companyenrich';
import { revealByLinkedin } from '@/lib/contactout';
import { matchPerson } from '@/lib/apollo';
import { isRoleEmail } from '@/lib/tomba';
import { isQuotaError } from '@/lib/orthogonal';
import type { RevealResult, EmailHit, SearchError } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const PRICE = {
  ceEmail: 0.12,    // company-enrich /people/email
  apollo: 0.01,     // apollo /api/v1/people/match
  contactout: 0.55, // contactout /v1/linkedin/enrich
};

// Worst-case: all three tiers run (CE + Apollo + ContactOut).
const ESTIMATE_USD = PRICE.ceEmail + PRICE.apollo + PRICE.contactout;

function errorResponse(err: SearchError, status: number): Response {
  return new Response(JSON.stringify(err), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * On-demand email/phone reveal for a single person. Returns all emails found
 * across three parallel/sequential tiers:
 *   1. Company Enrich /people/email by ceId ($0.12, verified work email)
 *   2. Apollo /api/v1/people/match by LinkedIn or name+domain ($0.01, unverified)
 *   3. ContactOut /v1/linkedin/enrich by LinkedIn ($0.55, email + phone)
 * CE + Apollo run in parallel (both cheap). ContactOut runs for phone coverage.
 * Role/generic inboxes are filtered before returning.
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
    firstName?: string;
    lastName?: string;
    organizationName?: string;
  } | null;
  if (!body || (!body.ceId && !body.linkedin)) {
    return errorResponse({ error: 'bad_request' }, 400);
  }

  const idHash = await hashIp(clientIp(req.headers));

  const rl = await checkRateLimit(idHash);
  if (!rl.ok) {
    return errorResponse({ error: 'rate_limited', retryAfterSec: rl.retryAfterSec }, 429);
  }
  const session = readSession(req);
  if (sessionExceeded(session, ESTIMATE_USD)) {
    return errorResponse({ error: 'rate_limited', retryAfterSec: secondsUntilUtcMidnight() }, 429);
  }
  const reservation = await reserveSpend(ESTIMATE_USD, idHash);
  if (!reservation.allowed) {
    if (reservation.reason === 'perip') {
      return errorResponse({ error: 'rate_limited', retryAfterSec: secondsUntilUtcMidnight() }, 429);
    }
    return errorResponse({ error: 'capacity' }, 503);
  }

  let spentUsd = 0;
  const emails: EmailHit[] = [];
  let phone: string | null = null;

  try {
    // Tier 1 + 2 in parallel: CE (cheap verified) + Apollo (cheap unverified).
    const [ceEmail, apolloEmail] = await Promise.all([
      body.ceId
        ? resolveWorkEmail(body.ceId, body.domain).then((e) => {
            spentUsd += PRICE.ceEmail;
            return e;
          })
        : Promise.resolve(null),
      matchPerson({
        linkedin: body.linkedin,
        firstName: body.firstName,
        lastName: body.lastName,
        organizationName: body.organizationName ?? body.domain,
        domain: body.domain,
      }).then((e) => {
        spentUsd += PRICE.apollo;
        return e;
      }).catch(() => null), // Apollo failure is non-fatal
    ]);

    if (ceEmail && !isRoleEmail(ceEmail)) {
      emails.push({ email: ceEmail, source: 'company-enrich' });
    }
    if (apolloEmail && !isRoleEmail(apolloEmail)) {
      // Dedupe: skip if CE already found the same address.
      const ceNorm = ceEmail?.toLowerCase();
      if (apolloEmail.toLowerCase() !== ceNorm) {
        emails.push({ email: apolloEmail, source: 'apollo' });
      }
    }

    // Tier 3: ContactOut for phone + additional email (by LinkedIn).
    if (body.linkedin) {
      spentUsd += PRICE.contactout;
      const co = await revealByLinkedin(body.linkedin);
      if (co.phone) phone = co.phone;
      if (co.email && !isRoleEmail(co.email)) {
        const norm = co.email.toLowerCase();
        const already = emails.some((h) => h.email.toLowerCase() === norm);
        if (!already) emails.push({ email: co.email, source: 'contactout' });
      }
    }
  } catch (err) {
    await reconcileSpend(spentUsd - ESTIMATE_USD, idHash);
    if (isQuotaError(err)) return errorResponse({ error: 'capacity' }, 503);
    return errorResponse({ error: 'server_error', message: 'Reveal failed.' }, 502);
  }

  await reconcileSpend(spentUsd - ESTIMATE_USD, idHash);

  const result: RevealResult = { emails, phone };
  return new Response(JSON.stringify(result), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'set-cookie': sessionCookie(addSessionSpend(session, ESTIMATE_USD)),
    },
  });
}
