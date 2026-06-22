// Per-browser-session daily spend budget — a NAT-friendly fairness guard.
//
// Why a cookie and not just the per-IP cap: a whole school/office sits behind a
// single NAT IP, so a per-IP $ cap throttles them collectively. A signed cookie
// gives EACH browser its own daily allowance to try every feature, without
// penalizing shared networks. It's deliberately a SOFT guard — a determined
// abuser can clear cookies, at which point the per-IP daily cap (lib/spend.ts)
// and the global daily cap are the hard backstops. No DB: the (signed) running
// total rides in the cookie itself.
//
// The cookie is HMAC-signed so the client can't forge a lower spend total; if
// the signature or day doesn't check out we treat it as a fresh session (which
// is the abuse-resistant default — worst case the per-IP/global caps still hold).

import { createHmac, timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';

const COOKIE = 'rdx_sess';

function secret(): string {
  return process.env.SESSION_SECRET || process.env.IP_HASH_SALT || 'orthogonal-demo';
}

// Per-session daily budget (USD). Generous enough to run several searches +
// reveals (try every feature) but not to abuse. Set SESSION_DAILY_USD <= 0 to
// disable the session layer (per-IP + global caps still apply).
export function sessionCapUsd(): number | null {
  const raw = process.env.SESSION_DAILY_USD;
  const n = parseFloat(raw == null || raw === '' ? '3' : raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export interface Session {
  day: string; // UTC YYYY-MM-DD the cents are counted within
  cents: number; // spend reserved so far today
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function sign(value: string): string {
  return createHmac('sha256', secret()).update(value).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/** Read + verify the session cookie. Resets to a fresh budget on miss, bad
 *  signature, or a stale day (UTC rollover). */
export function readSession(req: NextRequest): Session {
  const today = utcDay();
  const raw = req.cookies.get(COOKIE)?.value;
  if (!raw) return { day: today, cents: 0 };
  const dot = raw.lastIndexOf('.');
  if (dot < 0) return { day: today, cents: 0 };
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!safeEqualHex(sig, sign(payload))) return { day: today, cents: 0 };
  try {
    const obj = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Session;
    if (obj.day !== today || typeof obj.cents !== 'number' || obj.cents < 0) {
      return { day: today, cents: 0 };
    }
    return { day: today, cents: Math.round(obj.cents) };
  } catch {
    return { day: today, cents: 0 };
  }
}

/** True if reserving `estimateUsd` would exceed this session's daily budget. */
export function sessionExceeded(session: Session, estimateUsd: number): boolean {
  const cap = sessionCapUsd();
  if (cap == null) return false; // session layer disabled
  return (session.cents + Math.round(estimateUsd * 100)) / 100 > cap;
}

/** Return a new session with `usd` added to the running total. */
export function addSessionSpend(session: Session, usd: number): Session {
  return { day: session.day, cents: Math.max(0, session.cents + Math.round(usd * 100)) };
}

/** Serialize a `Set-Cookie` header value carrying the signed session total. */
export function sessionCookie(session: Session): string {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  const value = `${payload}.${sign(payload)}`;
  // Expire at the next UTC midnight-ish; Max-Age=1 day is close enough since the
  // day stamp inside is the real source of truth (a stale day resets to 0).
  return `${COOKIE}=${value}; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax`;
}

/** Seconds until the next UTC midnight — the retry-after for a session-capped user. */
export function secondsUntilUtcMidnight(): number {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}
