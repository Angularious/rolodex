// Global daily spend tracking + kill switch, backed by Supabase.
// Cap is read from DAILY_SPEND_CAP_USD at request time so it stays editable.
// On a DB read error we fail CLOSED (treat as over cap) — this is the money
// guard, so we'd rather block than risk unbounded spend during an outage.

import { getSupabase, supabaseConfigured } from './supabase';

const COST_PER_CALL = 0.01;

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

/** Record `calls` paid API calls ($0.01 each) against the spend log. */
export async function recordSpend(calls: number): Promise<void> {
  if (calls <= 0 || !supabaseConfigured()) return;
  const sb = getSupabase();
  if (!sb) return;
  const cost = Math.round(calls * COST_PER_CALL * 100) / 100;
  const { error } = await sb.rpc('record_spend', { p_cost: cost });
  if (error) console.error('[spend.record]', error.message);
}

export { COST_PER_CALL };
