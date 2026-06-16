import { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Daily Vercel cron (see vercel.json). Issues one trivial query so Supabase sees
// DB activity — the free tier pauses a project after 7 days of NO database
// activity, which would otherwise take the whole site down (spend checks fail
// closed → 503) until someone manually resumes it.
export async function GET(req: NextRequest) {
  // Vercel sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const sb = getSupabase();
  if (!sb) return Response.json({ ok: true, db: 'not-configured' });

  const { error } = await sb.from('spend_events').select('id').limit(1);
  if (error) {
    console.error('[keepalive]', error.message);
    return Response.json({ ok: false }, { status: 500 });
  }
  return Response.json({ ok: true });
}
