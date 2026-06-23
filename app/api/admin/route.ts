import { NextRequest } from 'next/server';
import { recentEvents } from '@/lib/analytics';
import { getSpendStatus } from '@/lib/spend';
import { supabaseConfigured } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false; // locked unless a password is configured
  // Accept only the Authorization header — never a query param, which leaks
  // the password into server logs, CDN access logs, and browser history.
  const key = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  return key === expected;
}

function dayOf(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const events = await recentEvents(500);
  const spend = await getSpendStatus();

  const byDay = new Map<string, number>();
  const byDomain = new Map<string, number>();
  let errors = 0;
  let conversions = 0;

  for (const e of events) {
    byDay.set(dayOf(e.ts), (byDay.get(dayOf(e.ts)) ?? 0) + 1);
    byDomain.set(e.domain, (byDomain.get(e.domain) ?? 0) + 1);
    if (!e.success) errors++;
    // conversion events are logged as a pseudo-domain marker
    if (e.domain === '__conversion__') conversions++;
  }

  const searchEvents = events.filter((e) => e.domain !== '__conversion__');
  const total = searchEvents.length;

  return new Response(
    JSON.stringify({
      persistent: supabaseConfigured(),
      spend,
      totals: {
        searches: total,
        errorRate: total ? Math.round((errors / total) * 100) : 0,
        conversions,
      },
      searchesByDay: Array.from(byDay.entries())
        .map(([day, count]) => ({ day, count }))
        .sort((a, b) => (a.day < b.day ? 1 : -1)),
      topDomains: Array.from(byDomain.entries())
        .filter(([d]) => d !== '__conversion__')
        .map(([domain, count]) => ({ domain, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15),
      recent: searchEvents.slice(0, 40),
    }),
    { headers: { 'content-type': 'application/json' } },
  );
}
