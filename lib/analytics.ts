// Search event log in Supabase, surfaced on /admin. Conversions (clicks to
// orthogonal.com) are stored as events with the pseudo-domain '__conversion__'.

import { getSupabase } from './supabase';
import { SITE_ID } from './site';

export interface SearchEvent {
  ts: number;
  ipHash: string;
  domain: string;
  durationMs: number;
  cost: number;
  success: boolean;
  error?: string;
}

export async function logSearch(ev: SearchEvent): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    await sb.from('search_events').insert({
      site: SITE_ID,
      ip_hash: ev.ipHash,
      domain: ev.domain,
      duration_ms: ev.durationMs,
      cost_usd: ev.cost,
      success: ev.success,
    });
  } catch {
    // Analytics must never break a search.
  }
}

export async function logConversion(ipHash: string): Promise<void> {
  await logSearch({
    ts: Date.now(),
    ipHash,
    domain: '__conversion__',
    durationMs: 0,
    cost: 0,
    success: true,
  });
}

interface Row {
  ip_hash: string | null;
  domain: string | null;
  duration_ms: number | null;
  cost_usd: number | string | null;
  success: boolean | null;
  created_at: string;
}

export async function recentEvents(limit = 500): Promise<SearchEvent[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('search_events')
    .select('ip_hash, domain, duration_ms, cost_usd, success, created_at')
    .eq('site', SITE_ID) // shared project: only this site's events
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as Row[]).map((r) => ({
    ts: Date.parse(r.created_at),
    ipHash: r.ip_hash ?? '',
    domain: r.domain ?? '',
    durationMs: r.duration_ms ?? 0,
    cost: Number(r.cost_usd ?? 0),
    success: r.success ?? true,
  }));
}
