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
- Upstash Redis for cache + rate limit + spend counter (in-memory fallback in dev)
- Cloudflare Turnstile for bot protection (skipped in dev when unconfigured)

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
resolution → cache check → in-flight dedup lock → fires up to 5 Tomba calls in
parallel, emitting each section as it resolves → caches results → records spend
→ logs an analytics event.

Two cache tiers: company firmographics (7-day TTL) and employee emails (24-hour
TTL), stored separately so a manual refresh re-pulls only employees. A cold
search costs **$0.05** (5 calls), a cached search **$0**, optional name
resolution **+$0.01**.

### Cost & abuse controls
- Per-IP rate limit; competitor clicks and refreshes count against it
- Global daily spend cap (`DAILY_SPEND_CAP_USD`) — returns "demo at capacity" at 100%
- Manual refresh throttled to 1 per domain per IP per 24h
- In-flight dedup so double-clicks don't double-spend
- CORS lock + `robots.txt` disallow-all + no query in URL

### Notes
- No company blocklist — any real company is searchable. Free-email providers,
  localhost, and IPs are rejected as input (they can't yield a company report).
- The in-memory fallback is single-instance only; set Upstash for real
  cross-instance state on Vercel.
- `/admin?key=<ADMIN_PASSWORD>` shows searches/day, top domains, cache hit rate,
  daily spend, error rate, and Orthogonal click-throughs.
