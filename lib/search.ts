// Cache + in-flight dedup helpers shared by the search and refresh routes.
//
// Two cache tiers, stored separately so an employee refresh doesn't re-fetch
// company data (per spec):
//   company:{domain}   -> CompanyBundle   (7-day TTL)  — slow-changing firmographics
//   employees:{domain} -> EmployeeBundle  (24-hour TTL) — emails refresh daily

import { kv } from './redis';
import type { Company, Competitor, Counts, Employee, LocationCount } from './types';
import type { OrgExtras } from './tomba';

export const COMPANY_TTL = 60 * 60 * 24 * 7; // 7 days
export const EMPLOYEE_TTL = 60 * 60 * 24; // 24 hours

export interface CompanyBundle {
  company: Company; // base profile (org extras merged at emit time)
  counts: Counts | null;
  competitors: Competitor[] | null;
  locations: LocationCount[] | null;
  cachedAt: number;
}

export interface EmployeeBundle {
  employees: Employee[];
  totalAvailable: number;
  org: OrgExtras | null;
  cachedAt: number;
}

const companyKey = (d: string) => `company:${d}`;
const employeeKey = (d: string) => `employees:${d}`;
const lockKey = (d: string) => `lock:${d}`;

export async function loadCompanyBundle(domain: string): Promise<CompanyBundle | null> {
  return kv().get<CompanyBundle>(companyKey(domain));
}
export async function loadEmployeeBundle(domain: string): Promise<EmployeeBundle | null> {
  return kv().get<EmployeeBundle>(employeeKey(domain));
}

export async function saveCompanyBundle(domain: string, b: CompanyBundle): Promise<void> {
  await kv().set(companyKey(domain), b, COMPANY_TTL);
}
export async function saveEmployeeBundle(domain: string, b: EmployeeBundle): Promise<void> {
  await kv().set(employeeKey(domain), b, EMPLOYEE_TTL);
}

// In-flight dedup: acquire a short lock so concurrent identical searches don't
// each pay for the same cold fetch. Returns true if WE should do the fetching.
export async function acquireFetchLock(domain: string): Promise<boolean> {
  return kv().setNx(lockKey(domain), '1', 30);
}
export async function releaseFetchLock(domain: string): Promise<void> {
  await kv().del(lockKey(domain));
}

export async function bustEmployeeBundle(domain: string): Promise<void> {
  await kv().del(employeeKey(domain));
}

// Manual-refresh throttle: 1 refresh per domain per IP per 24h.
export async function checkRefreshThrottle(
  domain: string,
  idHash: string,
): Promise<{ ok: boolean; retryAfterSec?: number }> {
  const key = `refresh:${domain}:${idHash}`;
  const got = await kv().setNx(key, '1', EMPLOYEE_TTL);
  if (got) return { ok: true };
  const ttl = await kv().ttl(key);
  return { ok: false, retryAfterSec: ttl > 0 ? ttl : EMPLOYEE_TTL };
}

// Used by the loser of the lock race: poll the cache until the winner fills it.
export async function waitForBundles(
  domain: string,
  wantEmployees: boolean,
  timeoutMs = 9000,
): Promise<{ company: CompanyBundle | null; employees: EmployeeBundle | null }> {
  const deadline = Date.now() + timeoutMs;
  // Local sleep helper (Date.now allowed in route runtime).
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  while (Date.now() < deadline) {
    const company = await loadCompanyBundle(domain);
    const employees = wantEmployees ? await loadEmployeeBundle(domain) : null;
    if (company && (!wantEmployees || employees)) return { company, employees };
    await sleep(400);
  }
  return { company: await loadCompanyBundle(domain), employees: await loadEmployeeBundle(domain) };
}
