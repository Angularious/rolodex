import { NextRequest } from 'next/server';
import { logConversion } from '@/lib/analytics';
import { clientIp, hashIp } from '@/lib/hash';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Records a click-through to orthogonal.com so /admin can show conversion.
export async function POST(req: NextRequest) {
  const idHash = await hashIp(clientIp(req.headers));
  await logConversion(idHash);
  return new Response(null, { status: 204 });
}
