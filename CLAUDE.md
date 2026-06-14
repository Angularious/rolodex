# CLAUDE.md — Company Intel demo (rolodex)

Public demo: enter a company **domain or name** → instant streamed intelligence
report (profile, dept/seniority counts, geo, competitors, employee emails) from
**Tomba via the Orthogonal API**. Retro Cartoon-Network aesthetic. "Powered by
orthogonal.com" demo — not Orthogonal-owned branding.

- **Repo:** github.com/Angularious/rolodex (branch `main`; `gh` authed as Angularious)
- **Live:** rolodex-lime.vercel.app (Vercel, auto-deploys on push to `main`)
- **Owner:** Jerry Du (jerry@orthogonal.sh)

## Stack
Next.js 14 App Router · React 18 · Tailwind 3 + custom retro CSS · Supabase
(Postgres) for counters · Cloudflare Turnstile (invisible) · deployed on Vercel.

## Commands
```
npm run dev      # local dev (works with just ORTHOGONAL_API_KEY)
npm run build    # typecheck + build — run before committing
npm run start    # prod server
```
Env lives in `.env.local` (gitignored). **Do NOT delete `.env.local`** — it holds
the user's keys; it's already gitignore'd so it never gets committed.

## Architecture
- **`/api/search`** is ONE gated NDJSON-streaming route. Order: origin check →
  Turnstile → per-IP rate limit → global spend kill-switch → normalize /
  name→domain resolve → fire **5 Tomba calls in parallel**, emit each section as
  it resolves (`meta`, `company`, `counts`, `competitors`, `locations`,
  `employees`, `done`) → record spend → log analytics. Per-section failures are
  isolated (emit `{data:null, error}`).
- Client (`app/page.tsx`) reads the stream and renders sections progressively.
- `/api/track` logs orthogonal.com click-throughs. `/api/admin` + `/admin` page
  (gated by `ADMIN_PASSWORD`) show searches/spend/errors/conversions.

## NON-NEGOTIABLE: no caching of Orthogonal data
Per Orthogonal's data policy, **returned company/people data is NEVER persisted**.
Every search is a fresh fetch. There is no result cache and no in-flight dedup
(both were removed). Supabase stores ONLY our own usage metadata: rate-limit
events, spend ledger, analytics. **Do not re-introduce caching of Tomba responses.**
Cost: $0.05/cold search (5 calls), +$0.01 if a name needs resolving.

## Orthogonal / Tomba specifics
- Proxy pattern (server-only): `POST https://api.orthogonal.com/v1/run`,
  `Authorization: Bearer $ORTHOGONAL_API_KEY`, body `{api, path, query|body}`,
  response `{success, data}`. See `lib/orthogonal.ts`.
- **GOTCHA: `/v1/run` validates GET query values as STRINGS.** A numeric value
  (e.g. `limit: 50`) is rejected ("Expected string, received number"). The client
  coerces all GET query values to strings — keep that.
- **Tomba `limit` is an enum** (10 / 20 / 50, etc.), not arbitrary — app uses 50.
- Endpoints used: `/v1/companies/find`, `/v1/email-count`, `/v1/similar`,
  `/v1/location`, `/v1/domain-search` (employees + org block with `accept_all`,
  email `pattern`, social URLs), `/v1/domain-suggestions` (name→domain).
  Mappers + raw shapes in `lib/tomba.ts`.
- Data quality varies by domain. Good demo targets (verified): stripe.com,
  google.com, spacex.com, figma.com. **notion.so returned junk — avoid.**

## Supabase (the persistent store)
- Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (service-role, server-only).
- Run `supabase/schema.sql` once in the SQL editor. Tables: `rate_events`,
  `spend_events`, `search_events`. Functions: `check_and_log_rate`, `day_spend`,
  `record_spend`.
- Degrades gracefully when unset (dev): rate limit allows all, spend cap off,
  analytics no-op. **Required in prod** — Vercel functions are stateless, so an
  in-memory cap would reset and never hold.
- `lib/spend.ts` fails CLOSED on DB error (money guard); `lib/ratelimit.ts` fails
  OPEN (spend cap is the backstop).

## Turnstile (bot protection)
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (public, fine to expose) + `TURNSTILE_SECRET_KEY`
  (server-only). Skipped entirely in dev when the site key is unset.
- **Invisible:** widget uses `appearance="interaction-only"` — only shows on a real
  challenge. Don't CSS-hide it (breaks verification + violates CF terms).
- **Token flow (don't break this):** keep ONE widget mounted; consume the ready
  token, then call `boundTurnstile.reset()` to mint the next. Do NOT remount the
  widget per search — rapid remounts make Cloudflare return duplicate tokens that
  `siteverify` rejects (`timeout-or-duplicate` → 400 captcha_failed on every search
  after the first). This was a real bug; the reset() pattern fixed it.
- **Cloudflare hostnames:** the widget only loads on domains allowlisted in the CF
  Turnstile dashboard. Add the exact Vercel/prod domain. Preview deploys (random
  `*.vercel.app`) won't work — test on the production URL.

## Product decisions (from the user)
- **No company blocklist** — any real company is searchable. Only free-email
  providers / localhost / IPs are rejected as invalid input (`lib/normalize.ts`).
- Rate limits: **12/min, 60/hr, 120/day** per IP (loosened from 3/10/30 so
  exploring competitors doesn't lock users out). Competitor clicks count.
- Spend cap: `DAILY_SPEND_CAP_USD` (default 20), editable. UTC-day bucket.
- "Powered by orthogonal.com" appears only in the footer (kept out of hero subtext
  and header to avoid redundancy). Header CTA = "ORTHOGONAL.COM ↗".
- No privacy/ToS pages. No Slack alerts. `robots.txt` disallows all.

## Testing gotcha
`pkill -f "PORT=xxxx"` only kills the npm wrapper, NOT the `next-server` child
(PORT is an env var, not argv) → zombie server keeps serving stale builds. Kill by
port instead: `lsof -ti:PORT | xargs kill -9`.

## Conventions
- Run `npm run build` before committing (catches type errors).
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Only commit/push when asked.
