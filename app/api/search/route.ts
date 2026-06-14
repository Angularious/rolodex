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
import {
  loadCompanyBundle,
  loadEmployeeBundle,
  saveCompanyBundle,
  saveEmployeeBundle,
  acquireFetchLock,
  releaseFetchLock,
  waitForBundles,
  bustEmployeeBundle,
  checkRefreshThrottle,
  type CompanyBundle,
  type EmployeeBundle,
} from '@/lib/search';
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

  const body = (await req.json().catch(() => null)) as
    | { input?: string; turnstileToken?: string; refresh?: boolean }
    | null;
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

  // 5. Manual refresh: throttled to 1 per domain per IP per 24h, busts the
  // employee cache so the next fetch pulls fresh emails (company stays cached).
  if (body.refresh) {
    const throttle = await checkRefreshThrottle(domain, idHash);
    if (!throttle.ok) {
      return errorResponse(
        { error: 'rate_limited', message: 'This company was refreshed recently.', retryAfterSec: throttle.retryAfterSec },
        429,
      );
    }
    await bustEmployeeBundle(domain);
  }

  // ---- Stream the report as NDJSON ----
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let paidCalls = nameResolutionCost;
      let companyBundle = await loadCompanyBundle(domain);
      let employeeBundle = await loadEmployeeBundle(domain);
      const wantEmployees = true;

      const write = (msg: StreamMessage) =>
        controller.enqueue(encoder.encode(JSON.stringify(msg) + '\n'));

      const cachedCompany = Boolean(companyBundle);
      const cachedEmployees = Boolean(employeeBundle);

      write({
        type: 'meta',
        domain,
        cached: { company: cachedCompany, employees: cachedEmployees },
        resolvedFrom,
      });

      let companyMiss = !companyBundle;
      let employeeMiss = !employeeBundle;

      // In-flight dedup for cold fetches.
      let holdsLock = false;
      if (companyMiss || employeeMiss) {
        holdsLock = await acquireFetchLock(domain);
        if (!holdsLock) {
          const waited = await waitForBundles(domain, wantEmployees);
          if (waited.company) {
            companyBundle = waited.company;
            companyMiss = false;
          }
          if (waited.employees) {
            employeeBundle = waited.employees;
            employeeMiss = false;
          }
          // If the winner still didn't fill everything, fall through and fetch.
          if (companyMiss || employeeMiss) holdsLock = await acquireFetchLock(domain);
        }
      }

      // Track the base company profile + org extras for the merge.
      let companyBase: Company | null = companyBundle?.company ?? null;
      let orgExtras: OrgExtras | null = employeeBundle?.org ?? null;
      let companyEmitted = false;

      const emitCompany = () => {
        if (!companyBase) return;
        write({ type: 'company', data: mergeCompany(companyBase, orgExtras) });
        companyEmitted = true;
      };

      // Collectors for caching after the stream completes.
      let newCounts = companyBundle?.counts ?? null;
      let newCompetitors = companyBundle?.competitors ?? null;
      let newLocations = companyBundle?.locations ?? null;
      let newEmployees = employeeBundle?.employees ?? [];
      let newTotal = employeeBundle?.totalAvailable ?? 0;

      const jobs: Promise<unknown>[] = [];

      // ---- Company-level (7-day) section ----
      if (companyBundle) {
        emitCompany();
        write({ type: 'counts', data: companyBundle.counts });
        write({ type: 'competitors', data: companyBundle.competitors });
        write({ type: 'locations', data: companyBundle.locations });
      } else {
        jobs.push(
          findCompany(domain)
            .then((raw) => {
              paidCalls++;
              companyBase = mapCompany(raw, domain);
              emitCompany();
            })
            .catch(() => write({ type: 'company', data: null, error: 'unavailable' })),
        );
        jobs.push(
          emailCount(domain)
            .then((raw) => {
              paidCalls++;
              newCounts = mapCounts(raw);
              write({ type: 'counts', data: newCounts });
            })
            .catch(() => write({ type: 'counts', data: null, error: 'unavailable' })),
        );
        jobs.push(
          similar(domain)
            .then((raw) => {
              paidCalls++;
              newCompetitors = mapCompetitors(raw);
              write({ type: 'competitors', data: newCompetitors });
            })
            .catch(() => write({ type: 'competitors', data: null, error: 'unavailable' })),
        );
        jobs.push(
          locationDist(domain)
            .then((raw) => {
              paidCalls++;
              newLocations = mapLocations(raw);
              write({ type: 'locations', data: newLocations });
            })
            .catch(() => write({ type: 'locations', data: null, error: 'unavailable' })),
        );
      }

      // ---- Employee (24-hour) section ----
      if (employeeBundle) {
        write({
          type: 'employees',
          data: employeeBundle.employees,
          totalAvailable: employeeBundle.totalAvailable,
        });
        // org already merged into the cached-company emit above
      } else {
        jobs.push(
          domainSearch(domain, EMPLOYEE_LIMIT)
            .then((raw) => {
              paidCalls++;
              const mapped = mapEmployees(raw);
              orgExtras = mapOrgExtras(raw);
              newEmployees = mapped.employees;
              newTotal = mapped.totalAvailable;
              write({
                type: 'employees',
                data: mapped.employees,
                totalAvailable: mapped.totalAvailable,
              });
              // Re-emit the company card now that we have accept_all / pattern /
              // richer socials from the org block.
              if (companyEmitted && orgExtras) emitCompany();
            })
            .catch(() =>
              write({ type: 'employees', data: [], totalAvailable: 0, error: 'unavailable' }),
            ),
        );
      }

      await Promise.allSettled(jobs);

      // ---- Persist fresh bundles + spend, then close ----
      try {
        if (companyMiss && companyBase) {
          const bundle: CompanyBundle = {
            company: companyBase,
            counts: newCounts,
            competitors: newCompetitors,
            locations: newLocations,
            cachedAt: Date.now(),
          };
          await saveCompanyBundle(domain, bundle);
        }
        if (employeeMiss) {
          const bundle: EmployeeBundle = {
            employees: newEmployees,
            totalAvailable: newTotal,
            org: orgExtras,
            cachedAt: Date.now(),
          };
          await saveEmployeeBundle(domain, bundle);
        }
      } catch {
        /* caching is best-effort */
      } finally {
        if (holdsLock) await releaseFetchLock(domain);
      }

      const cost = Math.round(paidCalls * 0.01 * 100) / 100;
      if (paidCalls > 0) await recordSpend(paidCalls);

      const durationMs = Date.now() - started;
      write({ type: 'done', cost, durationMs });

      await logSearch({
        ts: Date.now(),
        ipHash: idHash,
        domain,
        cacheCompany: cachedCompany,
        cacheEmployees: cachedEmployees,
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
