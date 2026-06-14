import { NextRequest } from 'next/server';
import { logSearch } from '@/lib/analytics';
import { clientIp, hashIp } from '@/lib/hash';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Records a click-through to orthogonal.com so /admin can show conversion.
export async function POST(req: NextRequest) {
  const idHash = await hashIp(clientIp(req.headers));
  await logSearch({
    ts: Date.now(),
    ipHash: idHash,
    domain: '__conversion__',
    cacheCompany: false,
    cacheEmployees: false,
    durationMs: 0,
    cost: 0,
    success: true,
  });
  return new Response(null, { status: 204 });
}
