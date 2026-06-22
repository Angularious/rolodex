// Global daily spend tracking + kill switch, backed by Supabase.
// Cap is read from DAILY_SPEND_CAP_USD at request time so it stays editable.
// On a DB read error we fail CLOSED (treat as over cap) — this is the money
// guard, so we'd rather block than risk unbounded spend during an outage.
//
// The Supabase project is SHARED with other demo sites; every ledger query is
// scoped to SITE_ID so this site's cap is independent of the siblings'.

import { getSupabase, supabaseConfigured } from './supabase';
import { SITE_ID } from './site';

export function dailyCapUsd(): number {
  const raw = parseFloat(process.env.DAILY_SPEND_CAP_USD ?? '20');
  return Number.isFinite(raw) && raw > 0 ? raw : 20;
}

// Per-visitor daily spend sub-cap (USD). Bounds how much of the global cap any
// single IP can consume in a day, so one actor (or a script) can't drain it.
// A whole NAT'd network shares one IP, so keep this generous enough for an
// office/classroom; the per-session cookie budget (lib/session.ts) is the
// finer, NAT-friendly guard. Set PER_IP_DAILY_USD <= 0 (or unset) to disable.
export function perIpDailyCapUsd(): number | null {
  const raw = process.env.PER_IP_DAILY_USD;
  // Default $5 — one IP can't take more than ~25% of a $20 global cap, so a
  // single actor can't drain it, while leaving room for a few searches+reveals.
  const n = parseFloat(raw == null || raw === '' ? '5' : raw);
  return Number.isFinite(n) && n > 0 ? n : null; // <=0 disables the per-IP cap
}

export interface SpendStatus {
  spent: number;
  cap: number;
  ratio: number;
  overCap: boolean;
  warn: boolean; // >= 80%
}

export async function getSpendStatus(): Promise<SpendStatus> {
  const cap = dailyCapUsd();
  const sb = getSupabase();
  if (!sb) {
    // local dev: no persistent store, never cap
    return { spent: 0, cap, ratio: 0, overCap: false, warn: false };
  }

  const { data, error } = await sb.rpc('day_spend', { p_site: SITE_ID });
  if (error) {
    console.error('[spend]', error.message);
    return { spent: cap, cap, ratio: 1, overCap: true, warn: true }; // fail closed
  }

  const spent = Math.round(Number(data ?? 0) * 100) / 100;
  const ratio = cap > 0 ? spent / cap : 1;
  return { spent, cap, ratio, overCap: spent >= cap, warn: ratio >= 0.8 };
}

/**
 * Atomic HARD-cap reservation. Reserves `estimateUsd` (a worst-case cost) against
 * today's ledger only if it keeps the day under the cap. Returns whether the
 * request may proceed. Concurrent reservations are serialized in Postgres, so —
 * unlike the old check-then-record flow — a burst can't blow past the cap.
 *
 * Local dev (no Supabase): always allowed, no cap. On a DB error we fail CLOSED
 * (deny) — this is the money guard.
 */
export type ReserveReason = 'ok' | 'global' | 'perip';

export async function reserveSpend(
  estimateUsd: number,
  ipHash?: string,
): Promise<{ allowed: boolean; reason: ReserveReason }> {
  if (!supabaseConfigured()) return { allowed: true, reason: 'ok' }; // local dev: no cap
  const sb = getSupabase();
  if (!sb) return { allowed: true, reason: 'ok' };
  const estimate = Math.round(estimateUsd * 100) / 100;
  const ipCap = perIpDailyCapUsd();
  const { data, error } = await sb.rpc('reserve_spend', {
    p_estimate: estimate,
    p_cap: dailyCapUsd(),
    p_site: SITE_ID,
    // Only enforce the per-IP sub-cap when both an IP and a cap are present.
    p_ip: ipCap != null ? ipHash ?? null : null,
    p_ip_cap: ipCap,
  });
  if (error) {
    console.error('[spend.reserve]', error.message);
    return { allowed: false, reason: 'global' }; // fail closed
  }
  const res = data as { allowed?: boolean; reason?: ReserveReason } | null;
  return { allowed: Boolean(res?.allowed), reason: res?.reason ?? 'global' };
}

/**
 * Reconcile a reservation once the real cost is known. Pass `actual - estimate`
 * (usually negative — we reserved worst-case). Adds a correcting row so the
 * ledger nets to the true spend, tagged with the SAME ipHash as the reservation
 * so the per-IP daily sum stays correct. A no-op when the delta rounds to zero.
 */
export async function reconcileSpend(deltaUsd: number, ipHash?: string): Promise<void> {
  if (!supabaseConfigured()) return;
  const sb = getSupabase();
  if (!sb) return;
  const delta = Math.round(deltaUsd * 100) / 100;
  if (delta === 0) return;
  const { error } = await sb.rpc('record_spend', {
    p_cost: delta,
    p_site: SITE_ID,
    p_ip: ipHash ?? null,
  });
  if (error) console.error('[spend.reconcile]', error.message);
}
