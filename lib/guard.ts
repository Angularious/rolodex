// Shared request guards for the money-spending API routes (/api/search,
// /api/reveal). Both must reject cross-origin POSTs and obvious bots before
// any paid Orthogonal call happens.

import type { NextRequest } from 'next/server';

// Obvious non-browser / scripted clients. We don't block ALL non-browser UAs
// (accessibility tools, etc.), just well-known automated signatures.
const BOT_UA_RE =
  /(curl|wget|python-requests|python-urllib|go-http-client|java\/|libwww|httpclient|scrapy|headlesschrome|phantomjs|bot|spider|crawler)/i;

/**
 * CORS lock: only accept requests that originate from our own deployment.
 * Browsers send `Origin` on POST (even same-origin); we fall back to the
 * `Referer` origin. A request with NEITHER is not coming from our UI — reject
 * it (this closes the "curl with no Origin header" bypass).
 */
export function originAllowed(req: NextRequest): boolean {
  let origin = req.headers.get('origin');
  if (!origin) {
    const referer = req.headers.get('referer');
    if (referer) {
      try {
        origin = new URL(referer).origin;
      } catch {
        /* malformed referer — treated as missing below */
      }
    }
  }
  if (!origin) return false; // no Origin/Referer → not a real browser navigation

  const allow = process.env.ALLOWED_ORIGIN;
  try {
    const o = new URL(origin).host;
    if (allow && o === new URL(allow).host) return true;
    return o === req.headers.get('host');
  } catch {
    return false;
  }
}

/** True for empty or obviously-automated user agents. */
export function isBotUserAgent(req: NextRequest): boolean {
  const ua = req.headers.get('user-agent') ?? '';
  return !ua || BOT_UA_RE.test(ua);
}
