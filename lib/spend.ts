// Global daily spend tracking + kill switch.
// Cap is read from DAILY_SPEND_CAP_USD at request time so it stays editable
// without a redeploy on platforms that support runtime env (and is trivially
// editable via Vercel env + redeploy otherwise).

import { kv } from './redis';

const COST_PER_CALL = 0.01;
const DAY_SECONDS = 60 * 60 * 24;

function dayKey(): string {
  // UTC day bucket. Uses the request time; Date is allowed in route handlers.
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `spend:${y}-${m}-${d}`;
}

export function dailyCapUsd(): number {
  const raw = parseFloat(process.env.DAILY_SPEND_CAP_USD ?? '20');
  return Number.isFinite(raw) && raw > 0 ? raw : 20;
}

export interface SpendStatus {
  spent: number;
  cap: number;
  ratio: number;
  overCap: boolean;
  warn: boolean; // >= 80%
}

export async function getSpendStatus(): Promise<SpendStatus> {
  const cap = dailyCapUsd();
  const spent = (await kv().get<number>(dayKey())) ?? 0;
  const ratio = cap > 0 ? spent / cap : 1;
  return { spent, cap, ratio, overCap: spent >= cap, warn: ratio >= 0.8 };
}

/** Record `calls` paid API calls ($0.01 each) against today's bucket. */
export async function recordSpend(calls: number): Promise<number> {
  if (calls <= 0) return (await kv().get<number>(dayKey())) ?? 0;
  return kv().incrByFloat(dayKey(), calls * COST_PER_CALL, DAY_SECONDS);
}

export { COST_PER_CALL };
