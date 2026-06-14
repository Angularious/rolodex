// Input normalization + validation pipeline (shared logic; the server is the
// source of truth, the client mirrors it for instant feedback).
//
// Per product spec v2 (revised): there is NO company blocklist — any real
// company is searchable. We still reject inputs that can't produce a useful
// company report: free-email providers, localhost, IPs, and too-short strings.

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'ymail.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'proton.me',
  'protonmail.com',
  'aol.com',
  'gmx.com',
  'mail.com',
  'zoho.com',
]);

const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

export type NormalizeResult =
  | { kind: 'domain'; domain: string }
  | { kind: 'name'; name: string }
  | { kind: 'invalid'; reason: string };

/**
 * First-pass normalization. Decides whether the raw input is already a domain,
 * a company name needing resolution, or invalid. Pure + synchronous so it can
 * run identically on client and server.
 */
export function normalizeInput(raw: string): NormalizeResult {
  let input = (raw ?? '').trim().toLowerCase();
  if (!input) return { kind: 'invalid', reason: 'Enter a company domain or name.' };

  // Pull a hostname out of anything URL-shaped.
  if (input.includes('://') || input.includes('/')) {
    const withProto = input.includes('://') ? input : `https://${input}`;
    try {
      input = new URL(withProto).hostname;
    } catch {
      input = input.split('/')[0];
    }
  }

  input = input.replace(/^www\./, '').replace(/\.$/, '');

  if (input.length < 4) {
    return { kind: 'invalid', reason: 'Input is too short — try a full company domain.' };
  }
  if (input === 'localhost' || IPV4_RE.test(input)) {
    return { kind: 'invalid', reason: 'IP addresses and localhost are not supported.' };
  }

  if (DOMAIN_RE.test(input)) {
    if (FREE_EMAIL_DOMAINS.has(input)) {
      return {
        kind: 'invalid',
        reason: 'Free email providers are not companies — try a company domain like brattle.com.',
      };
    }
    return { kind: 'domain', domain: input };
  }

  // Looks like a free-form company name.
  return { kind: 'name', name: input };
}

export function isFreeEmailDomain(domain: string): boolean {
  return FREE_EMAIL_DOMAINS.has(domain.toLowerCase());
}
