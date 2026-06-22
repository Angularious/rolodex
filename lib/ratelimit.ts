// Per-IP rate limiting via Supabase (limits are env-tunable, see below).
// One atomic RPC counts the three windows and logs the attempt if allowed,
// SCOPED to SITE_ID so a sibling demo's traffic on the shared project can't trip
// this site's per-IP limit (mirrors the spend scoping). In dev (no Supabase) we
// allow everything; on a DB error we fail OPEN here because the spend cap (a
// separate check) is the real money backstop.

import { getSupabase } from './supabase';
import { SITE_ID } from './site';

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec?: number;
}

// Request-rate limit per hashed IP. This is now a coarse anti-burst guard, NOT
// the money guard: the per-IP daily $ sub-cap and the per-session budget bound
// cost, so these can be loose enough that a NAT'd network (a whole
// school/office sharing one public IP) doesn't hit a wall. Tune via env without
// a deploy. Defaults loosened from 12/60/120 for shared-network headroom.
const PER_MIN = intEnv('RATE_PER_MIN', 30);
const PER_HOUR = intEnv('RATE_PER_HOUR', 300);
const PER_DAY = intEnv('RATE_PER_DAY', 1000);

function intEnv(name: string, fallback: number): number {
  const n = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function checkRateLimit(idHash: string): Promise<RateLimitResult> {
  const sb = getSupabase();
  if (!sb) return { ok: true }; // local dev: no persistent store

  const { data, error } = await sb.rpc('check_and_log_rate', {
    p_id: idHash,
    p_min: PER_MIN,
    p_hour: PER_HOUR,
    p_day: PER_DAY,
    p_site: SITE_ID, // scope to this site so a sibling's volume can't trip our limit
  });

  if (error) {
    console.error('[ratelimit]', error.message);
    return { ok: true }; // fail open; spend cap still bounds cost
  }

  const res = data as { allowed?: boolean; retry_after_sec?: number } | null;
  if (res?.allowed) return { ok: true };
  return { ok: false, retryAfterSec: res?.retry_after_sec ?? 60 };
}
