import { NextRequest } from 'next/server';
import { clientIp, hashIp } from '@/lib/hash';
import { checkRateLimit } from '@/lib/ratelimit';
import { reserveSpend, reconcileSpend } from '@/lib/spend';
import { normalizeInput } from '@/lib/normalize';
import { originAllowed, isBotUserAgent } from '@/lib/guard';
import {
  readSession,
  sessionExceeded,
  addSessionSpend,
  sessionCookie,
  secondsUntilUtcMidnight,
} from '@/lib/session';
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
import { fundingRounds as fundableFunding, mapFundableFunding, FUNDABLE_COST } from '@/lib/fundable';
import { similar, mapCompetitors, domainSearch, mapTombaEmployees, mergeAllEmployees, emailFormat, mapEmailFormat } from '@/lib/tomba';
import { searchPeople as coSearch, mapContactOutPeople } from '@/lib/contactout';
import { search as seltzSearch, mapSignals, mapJobs, mapNarrative, SELTZ_COST } from '@/lib/seltz';
import type { RawSeltzResponse } from '@/lib/seltz';
import { logSearch } from '@/lib/analytics';
import { isQuotaError } from '@/lib/orthogonal';
import type { Company, StreamMessage, SearchError } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A name-input search resolves the company (≤9s) and then streams several
// parallel calls (≤9s), so the worst case exceeds Vercel's default 10s limit.
export const maxDuration = 30;

// Default employee page size — the main cost knob ($0.0245/person). Company
// Enrich bills on the REQUESTED page size, not the returned count, so this is
// both the value knob and the cost knob. Env-tunable without a deploy.
const PAGE_SIZE = (() => {
  const n = parseInt(process.env.EMPLOYEE_PAGE_SIZE ?? '', 10);
  return Number.isFinite(n) && n > 0 && n <= 25 ? n : 8;
})();

// Max combined employees to show (CE + ContactOut + Tomba). All three sources
// fire for every search; this is a display cap only, env-tunable.
const EMPLOYEE_DISPLAY_MAX = (() => {
  const n = parseInt(process.env.EMPLOYEE_LIST_MAX ?? '', 10);
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : 50;
})();

// Per-call prices (USD) for the spend ledger. Keep in sync with the marketplace.
const PRICE = {
  enrich: 0.01225, // company-enrich /companies/enrich or /companies
  workforce: 0.06125, // company-enrich /companies/workforce
  perPerson: 0.0245, // company-enrich /people/search (per result)
  competitors: 0.01, // tomba /v1/similar
  fundableFunding: FUNDABLE_COST, // fundable /company/deals (funding fallback, 7 rounds)
  tombaEmployees: 0.01, // tomba /v1/domain-search (always fires, flat)
  emailFormat: 0.01, // tomba /v1/email-format (domain email pattern)
  contactoutSearch: 0.05, // contactout /v1/people/search (discovery, flat 25 profiles)
  seltz: SELTZ_COST, // seltz /v1/search (per call, $0.00625)
};

// Worst-case cost of one search, reserved against the hard cap up front and
// reconciled to the real amount after. Includes a possible profile-fallback call.
// Fundable fallback fires only for companies with thin CE funding data (a
// minority of searches), so it is excluded from the upfront reservation.
// reconcileSpend handles the delta on the searches where it does fire.
const ESTIMATE_USD =
  PRICE.enrich * 2 +
  PRICE.workforce +
  PRICE.perPerson * PAGE_SIZE +
  PRICE.competitors +
  PRICE.tombaEmployees + // employee-list augment (flat, always fires)
  PRICE.emailFormat + // domain email pattern (flat, always fires)
  PRICE.contactoutSearch + // employee discovery (flat, always fires)
  PRICE.seltz * 6; // seltz: 3 signals + 2 jobs + 1 narrative (always fires)

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

  // 3. Per-session (cookie) budget — NAT-friendly fairness guard so one browser
  //    can't monopolize the global cap, without throttling a shared network.
  //    Soft: bypassable by clearing cookies; the per-IP + global caps are hard.
  const session = readSession(req);
  if (sessionExceeded(session, ESTIMATE_USD)) {
    return errorResponse(
      { error: 'rate_limited', retryAfterSec: secondsUntilUtcMidnight() },
      429,
    );
  }

  // 4. Global spend HARD cap + per-IP daily sub-cap — atomically reserve this
  //    search's worst-case cost, scoped to this IP. 'global' → whole-day cap hit
  //    (everyone is at capacity); 'perip' → this visitor's daily $ budget is
  //    spent (a per-visitor 429). The real cost is reconciled against this
  //    reservation once the search finishes. Every path AFTER this point must
  //    reconcile (success or early return).
  const reservation = await reserveSpend(ESTIMATE_USD, idHash);
  if (!reservation.allowed) {
    if (reservation.reason === 'perip') {
      return errorResponse(
        { error: 'rate_limited', retryAfterSec: secondsUntilUtcMidnight() },
        429,
      );
    }
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
        await reconcileSpend(initialSpent - ESTIMATE_USD, idHash);
        return errorResponse(
          { error: 'not_found', message: `Couldn't resolve "${norm.name}" to a company.` },
          404,
        );
      }
      domain = resolvedDomain.toLowerCase();
      resolvedFrom = norm.name;
      preResolvedCompany = mapCompany(raw, domain);
    } catch (err) {
      await reconcileSpend(initialSpent - ESTIMATE_USD, idHash);
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
      // structured rounds from Fundable ($0.462) and merge them into the profile.
      // Fires only on thin funding, so most searches stay at the base cost.
      const augmentFunding = async (company: Company): Promise<Company> => {
        // Fire only when CE funding is thin: no rounds at all, OR rounds present
        // but none carry a dollar amount (common — e.g. scale.com returns round
        // types/dates/investors with every amount null, rendering as "—").
        const ceRounds = company.fundingRounds ?? [];
        if (ceRounds.length && ceRounds.some((r) => r.amount)) return company;
        try {
          const raw = await fundableFunding(domain);
          // Charge on any successful API call — Fundable bills per request,
          // not per returned deal.
          spentUsd += PRICE.fundableFunding;
          const f = mapFundableFunding(raw);
          if (f && f.fundingRounds.length) {
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
        (async () => {
          // Fire all three employee sources in parallel.
          let company = preResolvedCompany?.name || domain.split('.')[0];
          if (company.length < 3) company = domain; // Tomba requires 3-75 chars

          const [ceRaw, coRaw, tombaRaw] = await Promise.allSettled([
            peopleSearch(domain, PAGE_SIZE),
            coSearch(domain),
            domainSearch(domain, company, 50),
          ]);

          // CE: billed on REQUESTED page size (not returned count).
          let ceEmployees: ReturnType<typeof mapPeople>['employees'] = [];
          let totalAvailable = 0;
          if (ceRaw.status === 'fulfilled') {
            spentUsd += PRICE.perPerson * PAGE_SIZE;
            const mapped = mapPeople(ceRaw.value);
            ceEmployees = mapped.employees;
            totalAvailable = mapped.totalAvailable;
          } else {
            noteQuota(ceRaw.reason);
          }

          // ContactOut: flat $0.05 for 25 profiles.
          let coEmployees: import('@/lib/types').Employee[] = [];
          if (coRaw.status === 'fulfilled') {
            spentUsd += PRICE.contactoutSearch;
            coEmployees = mapContactOutPeople(coRaw.value);
          } else {
            noteQuota(coRaw.reason);
          }

          // Tomba: flat $0.01 for up to 50 domain emails. Pass domain so the mapper
          // can drop emails from same-named companies at a different TLD.
          let tombaEmployees: import('@/lib/types').Employee[] = [];
          if (tombaRaw.status === 'fulfilled') {
            spentUsd += PRICE.tombaEmployees;
            tombaEmployees = mapTombaEmployees(tombaRaw.value, domain);
          } else {
            noteQuota(tombaRaw.reason);
          }

          const merged = mergeAllEmployees(ceEmployees, coEmployees, tombaEmployees, EMPLOYEE_DISPLAY_MAX);
          totalAvailable = Math.max(totalAvailable, merged.length);
          write({ type: 'employees', data: merged, totalAvailable });
        })(),
        similar(domain)
          .then((raw) => {
            spentUsd += PRICE.competitors;
            write({ type: 'competitors', data: mapCompetitors(raw) });
          })
          .catch((err) => {
            noteQuota(err);
            write({ type: 'competitors', data: null, error: 'unavailable' });
          }),
        emailFormat(domain)
          .then((raw) => {
            spentUsd += PRICE.emailFormat;
            const patterns = mapEmailFormat(raw);
            if (patterns.length) write({ type: 'emailformat', patterns });
          })
          .catch(() => {
            // Non-critical: missing format just means no pattern emails in UI.
          }),
        // --- Seltz web search jobs (all three fire in parallel with other sections) ---
        // Company name for queries: use resolved name, fall back to domain root.
        (async () => {
          const co = preResolvedCompany?.name ?? domain.split('.')[0];
          const queries = [
            `"${co}" funding investment announcement`,
            `"${co}" product launch new feature`,
            `"${co}" customer case study partnership`,
          ];
          const results = await Promise.allSettled(queries.map((q) => seltzSearch(q, 5)));
          const raws: RawSeltzResponse[] = [];
          for (const r of results) {
            if (r.status === 'fulfilled') { spentUsd += PRICE.seltz; raws.push(r.value); }
            else noteQuota(r.reason);
          }
          const signals = mapSignals(raws, ['funding', 'product', 'customer']);
          write({ type: 'signals', data: signals.length ? signals : null });
        })(),
        (async () => {
          const co = preResolvedCompany?.name ?? domain.split('.')[0];
          const queries = [
            `"${co}" software engineer product manager hiring`,
            `"${co}" sales marketing growth hiring careers`,
          ];
          const results = await Promise.allSettled(queries.map((q) => seltzSearch(q, 10)));
          const raws: RawSeltzResponse[] = results
            .filter((r): r is PromiseFulfilledResult<RawSeltzResponse> => r.status === 'fulfilled')
            .map((r) => r.value);
          for (const r of results) { if (r.status === 'fulfilled') spentUsd += PRICE.seltz; else noteQuota(r.reason); }
          const jobPostings = mapJobs(raws);
          write({ type: 'jobs', data: jobPostings.length ? jobPostings : null });
        })(),
        (async () => {
          try {
            const raw = await seltzSearch(`site:${domain} about company products`, 3);
            spentUsd += PRICE.seltz;
            const description = mapNarrative(raw);
            if (description) write({ type: 'narrative', description });
          } catch (err) {
            noteQuota(err);
          }
        })(),
      ];

      await Promise.allSettled(jobs);

      const cost = Math.round(spentUsd * 100) / 100;
      // Reconcile the worst-case reservation down to the real cost (same IP hash
      // so the per-IP daily sum nets correctly).
      await reconcileSpend(spentUsd - ESTIMATE_USD, idHash);

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

  // Charge the session budget by the worst-case estimate (consistent with the
  // reservation; conservative for a soft guard). Set before the stream body —
  // headers can't change once streaming starts.
  const bumped = addSessionSpend(session, ESTIMATE_USD);

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      'x-accel-buffering': 'no',
      'set-cookie': sessionCookie(bumped),
    },
  });
}
