// Thin client for the Orthogonal REST API (server-side only).
// Every Tomba call is proxied through https://api.orthogonal.com/v1/run so the
// Orthogonal key never reaches the browser.

const ORTHOGONAL_URL = 'https://api.orthogonal.com/v1/run';
// Kept under Vercel's serverless function ceiling so a slow upstream call is
// aborted by us (clean per-section error) rather than killed by the platform.
const TIMEOUT_MS = 9000;

export class OrthogonalError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = 'OrthogonalError';
    this.status = status;
  }
}

/**
 * Call an Orthogonal-proxied endpoint.
 * GET endpoints pass params as `query`, POST endpoints as `body`.
 * Returns the unwrapped `data` payload (still provider-shaped).
 */
export async function callOrthogonal<T = unknown>(
  api: string,
  path: string,
  params: Record<string, unknown>,
  method: 'GET' | 'POST' = 'GET',
): Promise<T> {
  const key = process.env.ORTHOGONAL_API_KEY;
  if (!key) {
    throw new OrthogonalError('ORTHOGONAL_API_KEY is not configured', 500);
  }

  // Orthogonal's /v1/run validates GET query values as strings, so coerce them
  // (a numeric `limit`, for example, is rejected as "Expected string").
  let payloadParams: Record<string, unknown> = params;
  if (method === 'GET') {
    payloadParams = {};
    for (const [k, v] of Object.entries(params)) {
      if (v === null || v === undefined) continue;
      payloadParams[k] = typeof v === 'string' ? v : String(v);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(ORTHOGONAL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ api, path, [method === 'GET' ? 'query' : 'body']: payloadParams }),
      cache: 'no-store',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    console.error(`[orthogonal] HTTP ${res.status} for ${api}${path}`);
    throw new OrthogonalError(`Orthogonal HTTP ${res.status} for ${api}${path}`, res.status);
  }

  const json = (await res.json()) as { success?: boolean; data?: unknown; error?: unknown };
  if (json.success === false) {
    console.error(`[orthogonal] failed ${api}${path}:`, JSON.stringify(json.error));
    throw new OrthogonalError(`Orthogonal call failed for ${api}${path}`, 502);
  }
  return json.data as T;
}
