// Hash a visitor IP for rate-limit keys and analytics so raw IPs are never
// persisted. Uses Web Crypto (available in the Next.js runtime).

export async function hashIp(ip: string): Promise<string> {
  const salt = process.env.IP_HASH_SALT ?? 'orthogonal-demo';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${ip}`));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

export function clientIp(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    headers.get('x-real-ip') ||
    'unknown'
  );
}
