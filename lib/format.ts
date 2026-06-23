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

let regionNames: Intl.DisplayNames | null = null;

// Reverse map: English country name (lowercase) → ISO-2 code. Built once lazily.
let reverseRegion: Map<string, string> | null = null;
function getReverse(): Map<string, string> {
  if (reverseRegion) return reverseRegion;
  reverseRegion = new Map();
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'region' });
    const codes = [
      'US','GB','CA','AU','DE','FR','IN','CN','JP','BR','MX','SG','NL','SE','CH',
      'IE','IL','NZ','AE','ES','IT','PL','PT','NO','DK','FI','AT','BE','CZ','HU',
      'RO','GR','BG','HR','SK','SI','EE','LV','LT','TR','UA','RU','KR','TW','HK',
      'TH','VN','PH','ID','MY','PK','BD','NG','KE','ZA','GH','EG','AR','CO','CL',
      'PE','VE','EC','BO','PY','UY','CU','DO','GT','HN','SV','NI','CR','PA','PR',
    ];
    for (const code of codes) {
      const name = dn.of(code);
      if (name) reverseRegion.set(name.toLowerCase(), code);
    }
  } catch { /* ignore — falls back to null */ }
  return reverseRegion;
}

/** Convert an English country name ("United States") to ISO-2 code ("US"), or null. */
export function countryCode(name: string | null | undefined): string | null {
  if (!name) return null;
  return getReverse().get(name.toLowerCase()) ?? null;
}

export function countryName(code: string): string {
  if (!code) return code;
  try {
    regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' });
    return regionNames.of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}
