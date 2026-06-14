# Company Intel — Orthogonal demo

Public demo: enter a company **domain or name** and get an instant intelligence
report — profile, department/seniority breakdown, employee geo distribution,
competitors, and a people table with pattern-inferred emails. Data is pulled
from [Tomba](https://tomba.io) through the [Orthogonal](https://orthogonal.com)
API. Retro Cartoon-Network aesthetic, NDJSON-streamed progressive rendering,
production-grade abuse protection.

## Stack

- Next.js 14 (App Router) — deploy on Vercel
- Tailwind + custom retro CSS
- Route Handlers proxy Orthogonal server-side (the key never reaches the browser)
- Upstash Redis for rate-limit counters + the global spend counter (in-memory fallback in dev)
- Cloudflare Turnstile for bot protection (skipped in dev when unconfigured)

> **No data caching.** Per Orthogonal's data policy, responses are never
> persisted — every search fires fresh Tomba calls. Redis is used only for
> rate-limit and spend counters (our own usage metadata), never for returned
> company/people data.

## Quick start

```bash
cp .env.local.example .env.local   # fill in ORTHOGONAL_API_KEY at minimum
npm install
npm run dev
```

With only `ORTHOGONAL_API_KEY` set, the app runs fully: Redis falls back to an
in-memory store and Turnstile verification is skipped. Add the other env vars
for production behavior.

## Environment

| Var | Required | Purpose |
|---|---|---|
| `ORTHOGONAL_API_KEY` | yes (for live data) | Server-side Orthogonal key |
| `DAILY_SPEND_CAP_USD` | no (default 20) | Global daily kill switch, editable |
| `TURNSTILE_SECRET_KEY` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | prod | Bot protection |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | prod | Shared cache/limits/spend |
| `ADMIN_PASSWORD` | for /admin | Protects the analytics dashboard |
| `IP_HASH_SALT` | recommended | Salt for hashing visitor IPs |
| `ALLOWED_ORIGIN` | no | Extra allowed origin for the CORS lock |

## How it works

`POST /api/search` (NDJSON stream) runs, in order: Turnstile → per-IP rate limit
(3/min, 10/hr, 30/day) → global spend kill switch → input normalize / name→domain
resolution → fires up to 5 Tomba calls in parallel, emitting each section as it
resolves → records spend → logs an analytics event.

Every search is a live fetch (no cache): it costs **$0.05** (5 calls), plus
**$0.01** if a company name had to be resolved to a domain. At the default
$20/day cap that's ~400 searches/day.

### Cost & abuse controls
- Per-IP rate limit; competitor clicks count against it
- Global daily spend cap (`DAILY_SPEND_CAP_USD`) — returns "demo at capacity" at 100%
- The submit button is disabled mid-search so a double-click can't double-fire
- CORS lock + `robots.txt` disallow-all + no query in URL

### Notes
- No company blocklist — any real company is searchable. Free-email providers,
  localhost, and IPs are rejected as input (they can't yield a company report).
- The in-memory fallback is single-instance only; set Upstash for real
  cross-instance rate-limit/spend state on Vercel.
- `/admin?key=<ADMIN_PASSWORD>` shows searches/day, top domains, daily spend,
  error rate, and Orthogonal click-throughs.
