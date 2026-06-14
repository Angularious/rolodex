// Thin client for the Orthogonal REST API (server-side only).
// Every Tomba call is proxied through https://api.orthogonal.com/v1/run so the
// Orthogonal key never reaches the browser.

const ORTHOGONAL_URL = 'https://api.orthogonal.com/v1/run';
const TIMEOUT_MS = 12000;

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
      body: JSON.stringify({ api, path, [method === 'GET' ? 'query' : 'body']: params }),
      cache: 'no-store',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new OrthogonalError(`Orthogonal HTTP ${res.status} for ${api}${path}`, res.status);
  }

  const json = (await res.json()) as { success?: boolean; data?: unknown };
  if (json.success === false) {
    throw new OrthogonalError(`Orthogonal call failed for ${api}${path}`, 502);
  }
  return json.data as T;
}
