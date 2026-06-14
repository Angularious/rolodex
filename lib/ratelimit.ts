// Per-IP rate limiting using fixed windows in Redis (or the in-memory fallback).
// Limits: 3/min, 10/hour, 30/day.

import { kv } from './redis';

interface Window {
  label: string;
  limit: number;
  seconds: number;
}

const WINDOWS: Window[] = [
  { label: 'min', limit: 3, seconds: 60 },
  { label: 'hour', limit: 10, seconds: 60 * 60 },
  { label: 'day', limit: 30, seconds: 60 * 60 * 24 },
];

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec?: number;
}

/**
 * Atomically increments all three windows for this identity and reports the
 * first one that is exceeded. `cost` lets callers consume more than one unit
 * (e.g. competitor clicks still count as a search).
 */
export async function checkRateLimit(idHash: string, cost = 1): Promise<RateLimitResult> {
  const store = kv();
  for (const w of WINDOWS) {
    const key = `rl:${w.label}:${idHash}`;
    let count = 0;
    for (let i = 0; i < cost; i++) {
      count = await store.incr(key, w.seconds);
    }
    if (count > w.limit) {
      const retryAfterSec = await store.ttl(key);
      return { ok: false, retryAfterSec: retryAfterSec > 0 ? retryAfterSec : w.seconds };
    }
  }
  return { ok: true };
}
