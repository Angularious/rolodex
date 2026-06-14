// Client-side NDJSON stream reader for /api/search.

import type { StreamMessage } from './types';

export async function readSearchStream(
  res: Response,
  onMessage: (msg: StreamMessage) => void,
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try {
        onMessage(JSON.parse(line) as StreamMessage);
      } catch {
        /* ignore malformed line */
      }
    }
  }
  const tail = buffer.trim();
  if (tail) {
    try {
      onMessage(JSON.parse(tail) as StreamMessage);
    } catch {
      /* ignore */
    }
  }
}
