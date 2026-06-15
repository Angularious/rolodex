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
- Supabase (Postgres) for rate-limit counters + the global spend counter
- Origin lock + per-IP rate limiting + a global spend cap for abuse protection
  (no CAPTCHA — purely server-side)

> **No data caching.** Per Orthogonal's data policy, responses are never
> persisted — every search fires fresh Tomba calls. Supabase holds only
> rate-limit and spend counters (our own usage metadata), never returned
> company/people data.

## Quick start

```bash
cp .env.local.example .env.local   # fill in ORTHOGONAL_API_KEY at minimum
npm install
npm run dev
```

With only `ORTHOGONAL_API_KEY` set, the app runs fully: rate-limit/spend
tracking is disabled (no Supabase). Add the other env vars for production
behavior.

For persistent rate limits + spend cap, create a Supabase project and run
`supabase/schema.sql` once in its SQL editor, then set `SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY`.

## Environment

| Var | Required | Purpose |
|---|---|---|
| `ORTHOGONAL_API_KEY` | yes (for live data) | Server-side Orthogonal key |
| `DAILY_SPEND_CAP_USD` | no (default 20) | Global daily kill switch, editable |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | prod | Rate-limit + spend counters |
| `ADMIN_PASSWORD` | for /admin | Protects the analytics dashboard |
| `IP_HASH_SALT` | recommended | Salt for hashing visitor IPs |
| `ALLOWED_ORIGIN` | no | Extra allowed origin for the CORS lock |

## How it works

`POST /api/search` (NDJSON stream) runs, in order: origin lock → per-IP rate
limit (12/min, 60/hr, 120/day) → global spend kill switch → input normalize /
name→domain resolution → fires up to 5 Tomba calls in parallel, emitting each
section as it resolves → records spend → logs an analytics event.

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
- Without Supabase the rate limits and spend cap are no-ops (dev only); on
  Vercel's stateless functions you must configure Supabase so they actually
  hold.
- `/admin?key=<ADMIN_PASSWORD>` shows searches/day, top domains, daily spend,
  error rate, and Orthogonal click-throughs.
