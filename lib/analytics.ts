// Lightweight event log + daily counters in Redis, surfaced on /admin.

import { kv } from './redis';

export interface SearchEvent {
  ts: number;
  ipHash: string;
  domain: string;
  cacheCompany: boolean;
  cacheEmployees: boolean;
  durationMs: number;
  cost: number;
  success: boolean;
  error?: string;
}

const EVENTS_KEY = 'events';
const MAX_EVENTS = 500;

function dayBucket(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
}

export async function logSearch(ev: SearchEvent): Promise<void> {
  const store = kv();
  const day = dayBucket(ev.ts);
  try {
    await store.pushCapped(EVENTS_KEY, ev, MAX_EVENTS);
    await store.incr(`stat:searches:${day}`, 60 * 60 * 24 * 30);
    if (ev.cacheCompany || ev.cacheEmployees) await store.incr(`stat:cachehit:${day}`, 60 * 60 * 24 * 30);
    if (!ev.success) await store.incr(`stat:error:${day}`, 60 * 60 * 24 * 30);
    await store.incr(`stat:domain:${ev.domain}`, 60 * 60 * 24 * 30);
  } catch {
    // Analytics must never break a search.
  }
}

export async function logConversion(): Promise<void> {
  const day = dayBucket(Date.now());
  try {
    await kv().incr(`stat:conversion:${day}`, 60 * 60 * 24 * 30);
  } catch {
    /* ignore */
  }
}

export async function recentEvents(limit = 100): Promise<SearchEvent[]> {
  return kv().list<SearchEvent>(EVENTS_KEY, limit);
}
