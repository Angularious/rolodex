# CLAUDE.md — Company Intel demo (rolodex)

Public demo: enter a company **domain or name** → instant streamed intelligence
report (profile + funding + tech stack, department headcount, employees, decision-
makers, competitors). Data from **Company Enrich** (firmographics, funding, tech,
workforce, people) + **ContactOut** (decision-makers, on-demand email/phone reveal)
+ **Tomba** (competitors only), all via the Orthogonal API. Retro Cartoon-Network
aesthetic. "Powered by orthogonal.com" demo — not Orthogonal-owned branding.

- **Repo:** github.com/Angularious/rolodex (branch `main`; `gh` authed as Angularious)
- **Live:** rolodex-lime.vercel.app (Vercel, auto-deploys on push to `main`; feature
  branches get preview deploys). Workflow is **PR-based** — branch, PR, merge.
- **Owner:** Jerry Du (jerry@orthogonal.sh)
- **Status:** Tomba→Company Enrich+ContactOut migration is **merged & live** (PRs #1–3).
  Prod cap is **$40/day**; pg_cron pruning is enabled.

## Stack
Next.js 14 App Router · React 18 · Tailwind 3 + custom retro CSS · Supabase
(Postgres) for counters · deployed on Vercel.

## Commands
```
npm run dev      # local dev (works with just ORTHOGONAL_API_KEY)
npm run build    # typecheck + build — run before committing
npm run start    # prod server
```
Env lives in `.env.local` (gitignored). **Do NOT delete `.env.local`** — it holds
the user's keys; it's already gitignore'd so it never gets committed.

## Architecture
- **`/api/search`** is the gated NDJSON-streaming route. Order: origin check →
  per-IP rate limit → global spend kill-switch → normalize → (name input only)
  `POST /companies/enrich {name}` resolves domain **and** returns the profile →
  fire calls in parallel, emit each section as it resolves (`meta`, `company`,
  `workforce`, `employees`, `competitors`, `decisionmakers`, `done`) → record
  spend → log analytics. Per-section failures are isolated (emit `{data:null,error}`).
  The company-profile job falls back to `GET /companies?id=` (id from the workforce
  response) if `GET /companies/enrich?domain=` fails.
- **`/api/reveal`** is the on-demand email/phone route (per-click, not streamed).
  Same gating as search. Tiered: Company Enrich `/people/email` by person id ($0.12)
  → fall back to ContactOut `/v1/linkedin/enrich` ($0.55). Records real dollar cost.
- Shared gating lives in `lib/guard.ts` (`originAllowed`, `isBotUserAgent`), reused
  by both money-spending routes.
- Client (`app/page.tsx`) reads the stream and renders sections progressively; the
  Employees and Decision-makers tabs call `/api/reveal` per row.
- `/api/track` logs orthogonal.com click-throughs. `/api/admin` + `/admin` page
  (gated by `ADMIN_PASSWORD`) show searches/spend/errors/conversions.

## NON-NEGOTIABLE: no caching of Orthogonal data
Per Orthogonal's data policy, **returned company/people data is NEVER persisted**.
Every search and every reveal is a fresh fetch. There is no result cache and no
in-flight dedup. Supabase stores ONLY our own usage metadata: rate-limit events,
spend ledger, analytics. **Do not re-introduce caching of provider responses.**
Cost: ≈ **$0.74/search** at 25 employees (profile $0.012 + workforce $0.061 +
people×25 $0.61 + competitors $0.01 + decision-makers $0.05). `PAGE_SIZE` in
`app/api/search/route.ts` is the cost knob; the people-search line dominates.
Reveals are billed on demand on top:
- **Employee reveal** — CE `/people/email` hit = $0.12; CE miss → ContactOut
  fallback = $0.12 + $0.55 = **$0.67** (so a CE miss costs *more* than going
  straight to ContactOut). CE coverage on senior people is good (verified).
- **Decision-maker reveal** — ContactOut only = **$0.55** (no CE id available).
- **CAVEAT:** the ledger records the people-search cost on the *returned* count,
  but Company Enrich bills on the *requested* `pageSize`. For companies returning
  <25 people, recorded spend slightly under-counts the real invoice. The hard cap
  is unaffected (it reserves worst-case `pageSize` up front).

## Orthogonal / provider specifics
- Proxy pattern (server-only): `POST https://api.orthogonal.com/v1/run`,
  `Authorization: Bearer $ORTHOGONAL_API_KEY`, body `{api, path, query|body}`,
  response `{success, data}`. See `lib/orthogonal.ts`.
- **GOTCHA: `/v1/run` validates GET query values as STRINGS.** A numeric value is
  rejected. The client coerces all GET query values to strings — keep that. GET vs
  POST is signalled by whether params go in `query` or `body`.
- **GOTCHA: `company-enrich /companies/enrich` has BOTH a GET (by domain) and a POST
  (by name/social) at the same path.** Pass `query` for by-domain, `body` for by-name.
- **GOTCHA: ContactOut's two endpoints have DIFFERENT shapes — don't conflate them.**
  `/v1/people/decision-makers` → `{ profiles: { "<linkedin-url>": {...,
  contact_availability:{work_email,personal_email,phone}} } }` (a map keyed by URL,
  PLURAL-ish availability flags). `/v1/linkedin/enrich` → `{ profile: { work_email:[],
  personal_email:[], phone:[], email:[] } }` (single `profile`, SINGULAR names, each a
  string[]). Reading the wrong shape silently returns null AND still charges — this
  was the PR #2 bug.
- **Spend ledger is in DOLLARS** — reserve/reconcile pass dollar amounts (per-call
  prices vary by provider). Don't revert to a flat per-call multiplier.
- Mappers + raw shapes: `lib/companyenrich.ts` (enrich/workforce/people/email),
  `lib/contactout.ts` (decision-makers/reveal), `lib/tomba.ts` (similar only).
- Data quality varies by domain. Good demo targets (verified): stripe.com,
  google.com, spacex.com, figma.com.

## Supabase (the persistent store)
- Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (service-role, server-only).
- Run `supabase/schema.sql` once in the SQL editor. Tables: `rate_events`,
  `spend_events`, `search_events`. Functions: `check_and_log_rate` (advisory-locked),
  `day_spend`, `record_spend`, `reserve_spend` (atomic hard cap). Prod DB is current;
  **if you recreate the project, run the full `supabase/schema.sql`.**
- **Free-tier ops (both DONE in prod — keep this way):**
  1. **`pg_cron` enabled** + a daily `prune` job (04:00 UTC) trimming `rate_events`
     (>2d), `spend_events` (>40d), `search_events` (>90d) — see bottom of `schema.sql`.
     Without it the ledgers fill the 500MB free DB / slow the per-request COUNTs.
  2. The daily **`/api/cron/keepalive`** Vercel cron (see `vercel.json`) keeps the
     project from pausing after 7 days idle (a paused DB → spend check fails closed
     → whole site 503s). Optionally set `CRON_SECRET` to protect it.
- Degrades gracefully when unset (dev): rate limit allows all, spend cap off,
  analytics no-op. **Required in prod** — Vercel functions are stateless, so an
  in-memory cap would reset and never hold.
- `lib/spend.ts` fails CLOSED on DB error (money guard); `lib/ratelimit.ts` fails
  OPEN (spend cap is the backstop).

## Abuse protection (no CAPTCHA)
Cloudflare Turnstile was **removed** (2026-06-15) — no bot-challenge box. Three
code-level defenses guard **both** money-spending routes (`/api/search`,
`/api/reveal`) via `lib/guard.ts`:
1. **Origin lock** — `originAllowed()` rejects cross-origin POSTs (403). Allows
   requests whose `Origin` matches the serving host, or the explicit
   `ALLOWED_ORIGIN` env var. Stops other sites calling/embedding our API.
2. **Per-IP rate limit** — Supabase-backed, 12/min · 60/hr · 120/day per hashed
   IP. Competitor click-throughs count. Fails OPEN on DB error (`lib/ratelimit.ts`).
3. **Global daily spend cap** — `DAILY_SPEND_CAP_USD` (default $20). **Atomic hard
   cap**: each request RESERVES its worst-case cost up front via the `reserve_spend`
   RPC (serialized by a Postgres advisory lock), then reconciles to the real cost
   after (`reserveSpend`/`reconcileSpend` in `lib/spend.ts`). This holds under
   concurrent bursts — the old check-then-record flow was only a soft cap that a
   burst of parallel requests could blow past. Fails CLOSED on DB error.

Do NOT re-add Turnstile/CAPTCHA without asking — the user explicitly removed it
(the box was annoying). If distributed bots become a problem, prefer Vercel
WAF/Firewall (dashboard-configured, no visible challenge) over a CAPTCHA.

## Product decisions (from the user)
- **No company blocklist** — any real company is searchable. Only free-email
  providers / localhost / IPs are rejected as invalid input (`lib/normalize.ts`).
- Rate limits: **12/min, 60/hr, 120/day** per IP (loosened from 3/10/30 so
  exploring competitors doesn't lock users out). Competitor clicks count.
- Spend cap: `DAILY_SPEND_CAP_USD` (code default 20; **prod set to 40**), editable.
  UTC-day bucket. Atomic hard cap (reserve/reconcile) — see Abuse protection.
- **Reveal is gated by coverage**: decision-makers with all three coverage flags ✕
  (no work email / personal / phone) show a disabled, greyed "No contact available"
  button so a guaranteed-empty $0.55 reveal can't be triggered (PR #3). Employees
  have no pre-reveal coverage signal, so their Reveal button is always active.
- Reveals share the per-IP rate-limit budget with searches (conservative — bounds
  per-user spend). Email reveals are shown in-session only, never persisted.
- "Powered by orthogonal.com" appears only in the footer (kept out of hero subtext
  and header to avoid redundancy). Header CTA = "ORTHOGONAL.COM ↗".
- No privacy/ToS pages. No Slack alerts. `robots.txt` disallows all.

## Testing gotcha
`pkill -f "PORT=xxxx"` only kills the npm wrapper, NOT the `next-server` child
(PORT is an env var, not argv) → zombie server keeps serving stale builds. Kill by
port instead: `lsof -ti:PORT | xargs kill -9`.

**Never run `npm run build` while `next dev` is live** — both write `.next`, and the
prod build wipes the dev server's chunks → `Error: Cannot find module './NNN.js'`.
To recover: kill the dev server, `rm -rf .next`, restart dev (then hard-refresh the
browser). To typecheck without touching dev, use `npx tsc --noEmit` instead.

## Conventions
- Run `npm run build` before committing (catches type errors).
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Only commit/push when asked.
