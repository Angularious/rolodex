// Client-safe formatting helpers.

export function timeAgo(iso?: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

export function confidenceClass(score: number): string {
  if (score >= 80) return 'badge-green';
  if (score >= 50) return 'badge-yellow';
  return 'badge-red';
}

let regionNames: Intl.DisplayNames | null = null;
export function countryName(code: string): string {
  if (!code) return code;
  try {
    regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' });
    return regionNames.of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

export function flagEmoji(code: string): string {
  if (!code || code.length !== 2) return '🏳️';
  const base = 0x1f1e6;
  const cc = code.toUpperCase();
  return String.fromCodePoint(base + (cc.charCodeAt(0) - 65), base + (cc.charCodeAt(1) - 65));
}
