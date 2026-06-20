import { NextRequest } from 'next/server';
import { clientIp, hashIp } from '@/lib/hash';
import { checkRateLimit } from '@/lib/ratelimit';
import { reserveSpend, reconcileSpend } from '@/lib/spend';
import { normalizeInput } from '@/lib/normalize';
import { originAllowed, isBotUserAgent } from '@/lib/guard';
import {
  enrichByDomain,
  enrichByName,
  profileById,
  workforce,
  peopleSearch,
  mapCompany,
  mapWorkforce,
  mapPeople,
} from '@/lib/companyenrich';
import { decisionMakers, mapDecisionMakers } from '@/lib/contactout';
import { fundingRounds as aviatoFunding, mapAviatoFunding } from '@/lib/aviato';
import { similar, mapCompetitors } from '@/lib/tomba';
import { logSearch } from '@/lib/analytics';
import { isQuotaError } from '@/lib/orthogonal';
import type { Company, StreamMessage, SearchError } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A name-input search resolves the company (≤9s) and then streams several
// parallel calls (≤9s), so the worst case exceeds Vercel's default 10s limit.
export const maxDuration = 30;

// Default employee page size — the main cost knob ($0.0245/person, billed per
// returned result).
const PAGE_SIZE = 10;

// Decision-makers page size. The /people/decision-makers call is a flat $0.05
// regardless of per_page (reveal_info=false), so this is decoupled from
// PAGE_SIZE — we keep it higher to surface more decision-makers for free.
const DM_PAGE_SIZE = 25;

// Per-call prices (USD) for the spend ledger. Keep in sync with the marketplace.
const PRICE = {
  enrich: 0.01225, // company-enrich /companies/enrich or /companies
  workforce: 0.06125, // company-enrich /companies/workforce
  perPerson: 0.0245, // company-enrich /people/search (per result)
  competitors: 0.01, // tomba /v1/similar
  decisionMakers: 0.05, // contactout /people/decision-makers (reveal off)
  aviatoFunding: 0.08, // aviato /company/funding-rounds (funding fallback, flat)
};

// Worst-case cost of one search, reserved against the hard cap up front and
// reconciled to the real amount after. Includes a possible profile-fallback call.
const ESTIMATE_USD =
  PRICE.enrich * 2 +
  PRICE.workforce +
  PRICE.perPerson * PAGE_SIZE +
  PRICE.competitors +
  PRICE.decisionMakers +
  PRICE.aviatoFunding; // funding fallback may fire when CE has no round detail

function errorResponse(err: SearchError, status: number): Response {
  return new Response(JSON.stringify(err), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(req: NextRequest) {
  const started = Date.now();

  if (!originAllowed(req)) {
    return errorResponse({ error: 'bad_request', message: 'Cross-origin requests are not allowed.' }, 403);
  }
  if (isBotUserAgent(req)) {
    return errorResponse({ error: 'bad_request', message: 'Unsupported client.' }, 403);
  }

  const body = (await req.json().catch(() => null)) as { input?: string } | null;
  if (!body || typeof body.input !== 'string') {
    return errorResponse({ error: 'bad_request' }, 400);
  }

  const ip = clientIp(req.headers);
  const idHash = await hashIp(ip);

  // 1. Rate limit (competitor clicks share this path, so they count too)
  const rl = await checkRateLimit(idHash);
  if (!rl.ok) {
    return errorResponse({ error: 'rate_limited', retryAfterSec: rl.retryAfterSec }, 429);
  }

  // 2. Normalize + validate FIRST (no spend committed yet) so bad input can't
  //    leak reservations against the cap.
  const norm = normalizeInput(body.input);
  if (norm.kind === 'invalid') {
    return errorResponse({ error: 'invalid_domain', message: norm.reason }, 422);
  }

  // 3. Global spend HARD cap — atomically reserve this search's worst-case cost.
  //    If it would exceed the daily cap, reject before spending anything. The
  //    real cost is reconciled against this reservation once the search finishes.
  //    Every path AFTER this point must reconcile (success or early return).
  const reservation = await reserveSpend(ESTIMATE_USD);
  if (!reservation.allowed) {
    return errorResponse({ error: 'capacity' }, 503);
  }

  let domain: string;
  let resolvedFrom: string | null = null;
  let preResolvedCompany: Company | null = null;
  let initialSpent = 0;
  if (norm.kind === 'name') {
    try {
      const raw = await enrichByName(norm.name);
      initialSpent += PRICE.enrich;
      const resolvedDomain = raw?.domain;
      if (!resolvedDomain) {
        // Release the unused part of the reservation before bailing.
        await reconcileSpend(initialSpent - ESTIMATE_USD);
        return errorResponse(
          { error: 'not_found', message: `Couldn't resolve "${norm.name}" to a company.` },
          404,
        );
      }
      domain = resolvedDomain.toLowerCase();
      resolvedFrom = norm.name;
      preResolvedCompany = mapCompany(raw, domain);
    } catch (err) {
      await reconcileSpend(initialSpent - ESTIMATE_USD);
      // Key hit its limit while resolving → show capacity, not a generic error.
      if (isQuotaError(err)) return errorResponse({ error: 'capacity' }, 503);
      return errorResponse({ error: 'server_error' }, 502);
    }
  } else {
    domain = norm.domain;
  }

  // ---- Stream the report as NDJSON ----
  // No caching or in-flight dedup: per Orthogonal's data policy we never persist
  // returned data, so every search fires fresh calls.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let spentUsd = initialSpent;
      const write = (msg: StreamMessage) =>
        controller.enqueue(encoder.encode(JSON.stringify(msg) + '\n'));

      // If a section fails because the key hit its limit, every section is
      // failing the same way — flip this and abort the report with a capacity
      // screen instead of rendering a report full of empty sections.
      let quotaHit = false;
      const noteQuota = (err: unknown) => {
        if (isQuotaError(err)) quotaHit = true;
      };

      write({ type: 'meta', domain, resolvedFrom });

      // Workforce is fetched once and reused: the company-profile job falls back
      // to its embedded company_id if the by-domain profile lookup fails.
      const wfPromise = workforce(domain);

      // Funding fallback: when Company Enrich returns no round-level detail, pull
      // structured rounds from Aviato ($0.08) and merge them into the profile.
      // Fires only on thin funding, so most searches stay at the base cost.
      const augmentFunding = async (company: Company): Promise<Company> => {
        // Fire only when CE funding is thin: no rounds at all, OR rounds present
        // but none carry a dollar amount (common — e.g. scale.com returns round
        // types/dates/investors with every amount null, rendering as "—").
        const ceRounds = company.fundingRounds ?? [];
        if (ceRounds.length && ceRounds.some((r) => r.amount)) return company;
        try {
          const f = mapAviatoFunding(await aviatoFunding(domain));
          if (f && f.fundingRounds.length) {
            spentUsd += PRICE.aviatoFunding;
            return {
              ...company,
              fundingTotal: company.fundingTotal ?? f.fundingTotal,
              fundingStage: company.fundingStage ?? f.fundingStage,
              fundingRounds: f.fundingRounds,
            };
          }
        } catch (err) {
          noteQuota(err); // keep CE funding on failure
        }
        return company;
      };

      const companyJob = (async () => {
        let company: Company | null = preResolvedCompany;
        if (!company) {
          try {
            const raw = await enrichByDomain(domain);
            spentUsd += PRICE.enrich;
            company = mapCompany(raw, domain);
          } catch (err) {
            noteQuota(err);
            // Fallback: derive the profile from the workforce company_id.
            try {
              const wf = await wfPromise;
              const id = (wf as { company_id?: string | null })?.company_id;
              if (id) {
                const raw = await profileById(id);
                spentUsd += PRICE.enrich;
                company = mapCompany(raw, domain);
              }
            } catch (fallbackErr) {
              noteQuota(fallbackErr);
            }
          }
        }
        if (!company) {
          write({ type: 'company', data: null, error: 'unavailable' });
          return;
        }
        write({ type: 'company', data: await augmentFunding(company) });
      })();

      const jobs: Promise<unknown>[] = [
        companyJob,
        wfPromise
          .then((raw) => {
            spentUsd += PRICE.workforce;
            write({ type: 'workforce', data: mapWorkforce(raw) });
          })
          .catch((err) => {
            noteQuota(err);
            write({ type: 'workforce', data: null, error: 'unavailable' });
          }),
        peopleSearch(domain, PAGE_SIZE)
          .then((raw) => {
            const mapped = mapPeople(raw);
            spentUsd += PRICE.perPerson * mapped.employees.length;
            write({ type: 'employees', data: mapped.employees, totalAvailable: mapped.totalAvailable });
          })
          .catch((err) => {
            noteQuota(err);
            write({ type: 'employees', data: [], totalAvailable: 0, error: 'unavailable' });
          }),
        similar(domain)
          .then((raw) => {
            spentUsd += PRICE.competitors;
            write({ type: 'competitors', data: mapCompetitors(raw) });
          })
          .catch((err) => {
            noteQuota(err);
            write({ type: 'competitors', data: null, error: 'unavailable' });
          }),
        decisionMakers(domain, DM_PAGE_SIZE)
          .then((raw) => {
            spentUsd += PRICE.decisionMakers;
            write({ type: 'decisionmakers', data: mapDecisionMakers(raw) });
          })
          .catch((err) => {
            noteQuota(err);
            write({ type: 'decisionmakers', data: null, error: 'unavailable' });
          }),
      ];

      await Promise.allSettled(jobs);

      const cost = Math.round(spentUsd * 100) / 100;
      // Reconcile the worst-case reservation down to the real cost.
      await reconcileSpend(spentUsd - ESTIMATE_USD);

      // Key limit hit mid-stream → abort to the capacity screen.
      if (quotaHit) write({ type: 'fatal', error: 'capacity' });

      const durationMs = Date.now() - started;
      write({ type: 'done', cost, durationMs });

      await logSearch({
        ts: Date.now(),
        ipHash: idHash,
        domain,
        durationMs,
        cost,
        success: !quotaHit,
      });

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      'x-accel-buffering': 'no',
    },
  });
}
