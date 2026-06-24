// Seltz web search wrapper. $0.00625/call. POST /v1/search.
// Shape verified 2026-06-24: top-level key is `documents` (not `results`);
// each doc has `url`, `content`, `published_date`. No `title` field —
// we derive one from the first meaningful line of content.

import { callOrthogonal } from './orthogonal';
import type { Signal, JobSignal } from './types';

const API = 'seltz';
export const SELTZ_COST = 0.00625;

interface RawSeltzDoc {
  url?: string | null;
  content?: string | null;
  published_date?: string | null;
}

export interface RawSeltzResponse {
  documents?: RawSeltzDoc[] | null;
  // `results` is NOT returned by Seltz — kept as a no-op fallback
  results?: RawSeltzDoc[] | null;
}

export function search(query: string, maxResults = 5): Promise<RawSeltzResponse> {
  return callOrthogonal<RawSeltzResponse>(API, '/v1/search', { query, max_results: maxResults }, 'POST');
}

// --- helpers ---

/** First meaningful sentence from content (strips markdown headers, max 90 chars). */
function extractTitle(content: string | null | undefined): string | null {
  if (!content) return null;
  const lines = content.split('\n').map((l) => l.replace(/^#+\s*/, '').trim()).filter(Boolean);
  const first = lines.find((l) => l.length > 15 && !/^(Published|By |Posted|©)/i.test(l));
  if (!first) return null;
  return first.length > 90 ? first.slice(0, 90).trimEnd() + '…' : first;
}

/** Truncated plain-text snippet from content. */
function extractSnippet(content: string | null | undefined): string | null {
  if (!content) return null;
  // Strip markdown escape backslashes Seltz injects
  const clean = content.replace(/\\([^\\])/g, '$1').trim();
  return clean.length > 240 ? clean.slice(0, 240).trimEnd() + '…' : clean;
}

function sourceDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

function getDocs(raw: RawSeltzResponse): RawSeltzDoc[] {
  return (raw?.documents ?? raw?.results ?? []).filter((d) => !!d.url);
}

// --- mappers ---

export function mapSignals(raws: RawSeltzResponse[], categories: Signal['category'][]): Signal[] {
  const seen = new Set<string>();
  const out: Signal[] = [];
  for (let i = 0; i < raws.length; i++) {
    const category = categories[i] ?? 'general';
    for (const doc of getDocs(raws[i])) {
      if (!doc.url || seen.has(doc.url)) continue;
      seen.add(doc.url);
      out.push({
        url: doc.url,
        title: extractTitle(doc.content),
        snippet: extractSnippet(doc.content),
        source: sourceDomain(doc.url),
        category,
      });
    }
  }
  return out;
}

export function mapJobs(raws: RawSeltzResponse[]): JobSignal[] {
  const seen = new Set<string>();
  const out: JobSignal[] = [];
  for (const raw of raws) {
    for (const doc of getDocs(raw)) {
      if (!doc.url || seen.has(doc.url)) continue;
      seen.add(doc.url);
      out.push({
        url: doc.url,
        title: extractTitle(doc.content),
        snippet: extractSnippet(doc.content),
        source: sourceDomain(doc.url),
      });
    }
  }
  return out;
}

export function mapNarrative(raw: RawSeltzResponse): string | null {
  const docs = getDocs(raw);
  if (!docs.length) return null;
  const content = docs[0].content;
  if (!content || content.length < 50) return null;
  // Strip markdown escapes and cap at 400 chars for the description patch.
  const clean = content.replace(/\\([^\\])/g, '$1').trim();
  return clean.length > 400 ? clean.slice(0, 400).trimEnd() + '…' : clean;
}
