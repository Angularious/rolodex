// Per-IP rate limiting via Supabase (3/min, 10/hour, 30/day).
// One atomic RPC counts the three windows and logs the attempt if allowed.
// In dev (no Supabase) we allow everything; on a DB error we fail OPEN here
// because the global spend cap (a separate check) is the real money backstop.

import { getSupabase } from './supabase';

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec?: number;
}

// Generous enough to explore (search + click through several competitors)
// without hitting a wall. The global daily spend cap is the real money guard.
const PER_MIN = 12;
const PER_HOUR = 60;
const PER_DAY = 120;

export async function checkRateLimit(idHash: string): Promise<RateLimitResult> {
  const sb = getSupabase();
  if (!sb) return { ok: true }; // local dev: no persistent store

  const { data, error } = await sb.rpc('check_and_log_rate', {
    p_id: idHash,
    p_min: PER_MIN,
    p_hour: PER_HOUR,
    p_day: PER_DAY,
  });

  if (error) {
    console.error('[ratelimit]', error.message);
    return { ok: true }; // fail open; spend cap still bounds cost
  }

  const res = data as { allowed?: boolean; retry_after_sec?: number } | null;
  if (res?.allowed) return { ok: true };
  return { ok: false, retryAfterSec: res?.retry_after_sec ?? 60 };
}
