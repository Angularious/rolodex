// Global daily spend tracking + kill switch, backed by Supabase.
// Cap is read from DAILY_SPEND_CAP_USD at request time so it stays editable.
// On a DB read error we fail CLOSED (treat as over cap) — this is the money
// guard, so we'd rather block than risk unbounded spend during an outage.

import { getSupabase, supabaseConfigured } from './supabase';

export function dailyCapUsd(): number {
  const raw = parseFloat(process.env.DAILY_SPEND_CAP_USD ?? '20');
  return Number.isFinite(raw) && raw > 0 ? raw : 20;
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

  const { data, error } = await sb.rpc('day_spend');
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
export async function reserveSpend(estimateUsd: number): Promise<{ allowed: boolean }> {
  if (!supabaseConfigured()) return { allowed: true }; // local dev: no cap
  const sb = getSupabase();
  if (!sb) return { allowed: true };
  const estimate = Math.round(estimateUsd * 100) / 100;
  const { data, error } = await sb.rpc('reserve_spend', {
    p_estimate: estimate,
    p_cap: dailyCapUsd(),
  });
  if (error) {
    console.error('[spend.reserve]', error.message);
    return { allowed: false }; // fail closed
  }
  const res = data as { allowed?: boolean } | null;
  return { allowed: Boolean(res?.allowed) };
}

/**
 * Reconcile a reservation once the real cost is known. Pass `actual - estimate`
 * (usually negative — we reserved worst-case). Adds a correcting row so the
 * ledger nets to the true spend. A no-op when the delta rounds to zero.
 */
export async function reconcileSpend(deltaUsd: number): Promise<void> {
  if (!supabaseConfigured()) return;
  const sb = getSupabase();
  if (!sb) return;
  const delta = Math.round(deltaUsd * 100) / 100;
  if (delta === 0) return;
  const { error } = await sb.rpc('record_spend', { p_cost: delta });
  if (error) console.error('[spend.reconcile]', error.message);
}
