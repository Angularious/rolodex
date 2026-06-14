import { NextRequest } from 'next/server';
import { clientIp, hashIp } from '@/lib/hash';
import { verifyTurnstile } from '@/lib/turnstile';
import { checkRateLimit } from '@/lib/ratelimit';
import { getSpendStatus, recordSpend } from '@/lib/spend';
import { normalizeInput } from '@/lib/normalize';
import {
  findCompany,
  emailCount,
  similar,
  locationDist,
  domainSearch,
  resolveNameToDomain,
  mapCompany,
  mapOrgExtras,
  mergeCompany,
  mapCounts,
  mapCompetitors,
  mapLocations,
  mapEmployees,
  type OrgExtras,
} from '@/lib/tomba';
import { logSearch } from '@/lib/analytics';
import type { Company, StreamMessage, SearchError } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMPLOYEE_LIMIT = 50;

function errorResponse(err: SearchError, status: number): Response {
  return new Response(JSON.stringify(err), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// CORS lock: only accept requests originating from our own deployment.
function originAllowed(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // same-origin navigations / curl in dev
  const allow = process.env.ALLOWED_ORIGIN;
  try {
    const o = new URL(origin).host;
    if (allow && o === new URL(allow).host) return true;
    return o === req.headers.get('host');
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const started = Date.now();

  if (!originAllowed(req)) {
    return errorResponse({ error: 'bad_request', message: 'Cross-origin requests are not allowed.' }, 403);
  }

  const body = (await req.json().catch(() => null)) as { input?: string; turnstileToken?: string } | null;
  if (!body || typeof body.input !== 'string') {
    return errorResponse({ error: 'bad_request' }, 400);
  }

  const ip = clientIp(req.headers);
  const idHash = await hashIp(ip);

  // 1. Turnstile
  const human = await verifyTurnstile(body.turnstileToken, ip);
  if (!human) return errorResponse({ error: 'captcha_failed' }, 400);

  // 2. Rate limit (competitor clicks share this path, so they count too)
  const rl = await checkRateLimit(idHash);
  if (!rl.ok) {
    return errorResponse({ error: 'rate_limited', retryAfterSec: rl.retryAfterSec }, 429);
  }

  // 3. Global spend kill switch
  const spend = await getSpendStatus();
  if (spend.overCap) {
    return errorResponse({ error: 'capacity' }, 503);
  }

  // 4. Normalize + (optionally) resolve a company name to a domain
  const norm = normalizeInput(body.input);
  if (norm.kind === 'invalid') {
    return errorResponse({ error: 'invalid_domain', message: norm.reason }, 422);
  }

  let domain: string;
  let resolvedFrom: string | null = null;
  let nameResolutionCost = 0;
  if (norm.kind === 'name') {
    try {
      const resolved = await resolveNameToDomain(norm.name);
      nameResolutionCost = 1; // domain-suggestions is a paid call ($0.01)
      if (!resolved) {
        await recordSpend(nameResolutionCost);
        return errorResponse(
          { error: 'not_found', message: `Couldn't resolve "${norm.name}" to a company domain.` },
          404,
        );
      }
      domain = resolved;
      resolvedFrom = norm.name;
    } catch {
      return errorResponse({ error: 'server_error' }, 502);
    }
  } else {
    domain = norm.domain;
  }

  // ---- Stream the report as NDJSON ----
  // No caching or in-flight dedup: per Orthogonal's data policy we never persist
  // returned data, so every search fires fresh Tomba calls.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let paidCalls = nameResolutionCost;
      const write = (msg: StreamMessage) =>
        controller.enqueue(encoder.encode(JSON.stringify(msg) + '\n'));

      write({ type: 'meta', domain, resolvedFrom });

      // The company card needs accept_all / email-pattern / richer socials that
      // live on the domain-search response, so we merge org extras in and may
      // re-emit the company once the employee call resolves.
      let companyBase: Company | null = null;
      let orgExtras: OrgExtras | null = null;
      let companyEmitted = false;
      const emitCompany = () => {
        if (!companyBase) return;
        write({ type: 'company', data: mergeCompany(companyBase, orgExtras) });
        companyEmitted = true;
      };

      const jobs: Promise<unknown>[] = [
        findCompany(domain)
          .then((raw) => {
            paidCalls++;
            companyBase = mapCompany(raw, domain);
            emitCompany();
          })
          .catch(() => write({ type: 'company', data: null, error: 'unavailable' })),
        emailCount(domain)
          .then((raw) => {
            paidCalls++;
            write({ type: 'counts', data: mapCounts(raw) });
          })
          .catch(() => write({ type: 'counts', data: null, error: 'unavailable' })),
        similar(domain)
          .then((raw) => {
            paidCalls++;
            write({ type: 'competitors', data: mapCompetitors(raw) });
          })
          .catch(() => write({ type: 'competitors', data: null, error: 'unavailable' })),
        locationDist(domain)
          .then((raw) => {
            paidCalls++;
            write({ type: 'locations', data: mapLocations(raw) });
          })
          .catch(() => write({ type: 'locations', data: null, error: 'unavailable' })),
        domainSearch(domain, EMPLOYEE_LIMIT)
          .then((raw) => {
            paidCalls++;
            const mapped = mapEmployees(raw);
            orgExtras = mapOrgExtras(raw);
            write({ type: 'employees', data: mapped.employees, totalAvailable: mapped.totalAvailable });
            if (companyEmitted && orgExtras) emitCompany();
          })
          .catch(() => write({ type: 'employees', data: [], totalAvailable: 0, error: 'unavailable' })),
      ];

      await Promise.allSettled(jobs);

      const cost = Math.round(paidCalls * 0.01 * 100) / 100;
      if (paidCalls > 0) await recordSpend(paidCalls);

      const durationMs = Date.now() - started;
      write({ type: 'done', cost, durationMs });

      await logSearch({
        ts: Date.now(),
        ipHash: idHash,
        domain,
        durationMs,
        cost,
        success: true,
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
