# CLAUDE.md — Company Intel demo (rolodex)

Public demo: enter a company **domain or name** → instant streamed intelligence
report (profile + funding + tech stack, department headcount, employees,
competitors). Data from **Company Enrich** (firmographics, funding, tech,
workforce, people) + **ContactOut** (employee discovery + on-demand email/phone
reveal) + **Tomba** (competitors + employee emails + email-format patterns) +
**Fundable** (funding-round fallback), all via the Orthogonal API. Retro
Cartoon-Network aesthetic. "Powered by orthogonal.com" demo — not
Orthogonal-owned branding.

- **Repo:** github.com/Angularious/rolodex (branch `main`; `gh` authed as Angularious)
- **Live:** rolodex-lime.vercel.app (Vercel, auto-deploys on push to `main`; feature
  branches get preview deploys). Workflow is **PR-based** — branch, PR, merge.
- **Owner:** Jerry Du (jerry@orthogonal.sh)
- **Status:**
  - PRs #1–3: Tomba→CE+ContactOut migration, live.
  - PR #15 (2026-06-22): per-visitor caps, honest cost accounting, Tomba employee augment.
  - PR #17: audit cleanup (dead deps, image optimizer, font warning, ledger nits).
  - PR #19 (2026-06-22): decision-makers section removed → unified 30-person employee list.
  - **PR #20 (2026-06-23): 3-source employee discovery** — ContactOut people search added
    as primary source alongside CE; all three (CE + ContactOut + Tomba) fire in parallel;
    display cap raised 30→50; confidence badges per row; Tomba domain-contamination fix;
    admin auth hardened to header-only.
- **Cap value:** global cap is whatever `DAILY_SPEND_CAP_USD` is set to in Vercel
  (intent is **$20**). Layered beneath it: per-IP `PER_IP_DAILY_USD` ($5) + per-session
  `SESSION_DAILY_USD` ($3).
- **Env knobs (Vercel; all have safe code defaults so none are strictly required):**
  spend `DAILY_SPEND_CAP_USD` / `PER_IP_DAILY_USD` (5) / `SESSION_DAILY_USD` (3); rate
  `RATE_PER_MIN`/`RATE_PER_HOUR`/`RATE_PER_DAY` (30/300/1000); `EMPLOYEE_PAGE_SIZE` (8);
  `EMPLOYEE_LIST_MAX` (50); `SESSION_SECRET` (falls back to `IP_HASH_SALT`); `SITE_ID`
  (defaults `'rolodex'`). **`DM_PAGE_SIZE` is obsolete — decision-makers section
  removed.** **Vercel binds env to a deployment, so editing ANY of these
  requires a redeploy to take effect.**

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
  `workforce`, `employees`, `competitors`, `emailformat`, `signals`, `jobs`,
  `narrative`, `done`) → record spend → log analytics.
  Per-section failures are isolated (emit `{data:null,error}`).
  The company-profile job falls back to `GET /companies?id=` (id from the workforce
  response) if `GET /companies/enrich?domain=` fails. **Funding fallback:** if the
  resolved profile has no round-level funding detail, the company job pulls
  the most recent round from **Fundable** (`/company/deals`, $0.066 × 1 round = $0.066)
  and merges them in before emitting `company`. **Thin = no rounds OR rounds present
  but none carry a dollar amount** (CE often returns round types/dates/investors
  with `amount: null`). Fundable is domain-addressed directly; mapper in `lib/fundable.ts`.
  **Employee discovery (3-source, all fire in parallel):**
  1. **CE `/people/search`** (`lib/companyenrich.ts`) — LinkedIn-verified profiles with
     `ceId` for cheap email reveals ($0.0245/person, billed on REQUESTED page size not
     returned count). `source:'company-enrich'`.
  2. **ContactOut `/v1/people/search`** (`lib/contactout.ts`) — $0.05/page, 25
     profiles/page. **Two pages fired in parallel** for up to 50 profiles ($0.10
     total). Domain-scoped at the API level (confirmed: `plaid.co.jp` and `plaid.com`
     return distinct result sets). `source:'contactout'`. Investor/board/advisor
     titles filtered via `SKIP_CO_TITLE`. Empty-string seniority normalized to null.
     Single-char last names ("Paul D") dropped — ContactOut uses these when the full
     name isn't indexed.
  3. **Tomba `/v1/domain-search`** (`lib/tomba.ts`) — flat $0.01 for up to 50 domain
     emails (unverified pattern guesses). `source:'tomba'`, `emailUnverified:true`.
     **GOTCHA: domain filter is mandatory** — Tomba can return employees from a
     same-named company at a different TLD (e.g. plaid.co.jp for plaid.com). Only rows
     whose `email` domain exactly matches the searched domain are kept. **Do NOT trust
     Tomba's `type` field** — it's wrong in both directions. Use `isRealPerson`
     (name-quality + `ROLE_MAILBOX` blocklist) instead. Single-char local-parts
     (`r@spacex.com`) are also filtered.
  **Merge strategy** (`mergeAllEmployees` in `lib/tomba.ts`): CE rows first (highest
  quality, cheapest reveals) → ContactOut rows deduped against CE by normalized
  LinkedIn URL then full name (Tomba pattern email injected where LinkedIn matches) →
  Tomba-only fill. Cap = `EMPLOYEE_LIST_MAX` (default 50, env-tunable up to 100).
  Tomba failure keeps CE+CO list; CO failure keeps CE+Tomba list.
- **`/api/reveal`** is the on-demand email/phone route (per-click, not streamed).
  Same gating as search. Tiered: Company Enrich `/people/email` by person id ($0.12)
  → fall back to ContactOut `/v1/linkedin/enrich` ($0.55). Records real dollar cost.
  CE rows carry a `ceId` so they start at the cheap CE tier; ContactOut and Tomba
  rows have no `ceId` so they fall through directly to ContactOut ($0.55).
- **Admin route** (`/api/admin`): accepts `Authorization: Bearer <password>` header
  **only** — query-param auth was removed (leaked into server logs, CDN logs, browser
  history). `ADMIN_PASSWORD` must be set in Vercel env; if unset, the endpoint is
  locked to everyone.
- Shared gating lives in `lib/guard.ts` (`originAllowed`, `isBotUserAgent`), reused
  by both money-spending routes.
- Client (`app/page.tsx`) reads the stream and renders sections progressively; the
  Employees tab calls `/api/reveal` per row.
- **Confidence badges** on each employee row in `components/EmployeesTab.tsx`:
  green "verified" (CE), blue "enriched" (ContactOut), amber "pattern" (Tomba).
  ContactOut rows with `hasContactOutEmail: true` show "work email on file → Reveal"
  before the Enrich button. **UI never names providers** — badge labels are
  capability-based.
- **Graph View** (`components/circuit/`) is an optional **full-screen** results view
  (Summary View = the default; toggled via floating button). It's a **circuit-schematic drill-down map** —
  hand-laid-out **orthogonal SVG line-art**, NOT a force sim. **No Three.js / WebGL /
  d3-force / react-force-graph** (those were removed — the old `components/graph/`
  `GraphHUD.tsx`/`SpaceGraph.tsx` are deleted; the deps linger in `package.json` but
  nothing imports them, so they don't bundle). Self-contained visual identity (pure
  black, neon orthogonal traces, monospace, bracket-corner node frames) — deliberately
  **not** the site's purple/retro theme.
  - `CircuitGraph.tsx` (lazy `next/dynamic` `ssr:false`) renders the whole view: a
    bracket-corner **root node** (chip-triangle glyph + company name + domain) at center,
    **category "bus" boxes** fanning out on orthogonal trunks (double-line cardinals with
    arrowheads; jogged verticals with via dots; clean L-routed diagonals), plus fixed HTML
    chrome overlays that **don't pan**: top-left NETWORK OVERVIEW stat box (nodes/links/
    buses/status from real counts), breadcrumb (`ROOT / <BUS>`), bottom-left LEGEND, footer
    strip (system id from domain hash · generated ts · `RESEARCH // PUBLIC`).
  - **Drill-down state machine:** root view shows only root + bus boxes (no clusters). Click
    a bus → `focused` set, **CSS-transform camera** (`cameraFor`) pans+zooms toward that
    branch, and ONLY that bus's cluster grid renders (others dim). Click a sub-node → right
    **detail panel** slides in (terminal-style readout; employee **Enrich** reuses
    `revealContact`). Click ROOT breadcrumb / root node → back to level 0. One
    branch expanded at a time (avoids the old "too dense" problem).
  - `geometry.ts` = **pure layout math** (no React): `buildBuses` (categories with data →
    `Bus[]`; supports **N buses**, not hardcoded — **5 buses**: departments/competitors/
    employees on cardinals, tech/funding on diagonals), `busRect`/`trunk`/`grid`/`cameraFor`,
    `CIRCUIT_COLOR` neon palette. Cluster grid is DEPTH(≤3)×SPAN chips with a rail + chevron
    "data-flow" ticks; capped at 30 nodes (count label stays real). Coordinates live in a
    fixed `1400×1400` viewBox; the camera transform (not free panning) drives navigation.
  - Fed by the **in-memory `Report`** (no new route/fetch — preserves cost discipline) via
    the `GraphData` shape in `components/graph/types.ts` (still used; now also carries
    `employees`/`employeesTotal`). `components/graph/LoadingScreen.tsx` + `sample.ts`
    (powers free **`/?demo=1`**) are retained. Animations are `.circ-*` in `globals.css`.
    **UI never names providers** — the panel Source row says "Orthogonal".
- **`OrchestrationTrace`** (`components/OrchestrationTrace.tsx`) shows the data
  operations resolving live (running → done/empty/failed + counts, summary on done)
  to make the multi-step orchestration visible. Derived purely from client section
  state — no server change. Labels are **capability-based and never name a provider**
  (UI no-provider-names rule), and it carries **no Orthogonal branding** (that stays
  header/footer only).
- **Capacity vs. service-error:** an Orthogonal **key spend/usage limit** (HTTP 402/429,
  or a `success:false` body matching the quota keywords in `lib/orthogonal.ts`) is
  flagged `isQuota` on `OrthogonalError` and mapped to the **"DEMO AT CAPACITY"** screen
  — not the generic "service interrupted". In `/api/search` (where calls run mid-stream)
  this surfaces as a `{type:'fatal', error:'capacity'}` message that aborts the partial
  report; the pre-stream name-resolve and `/api/reveal` return `503 capacity` directly.
  Our **own** `DAILY_SPEND_CAP_USD` should be set below the Orthogonal-dashboard limit so
  the app cap trips first; the quota path is the backstop.
- `/api/track` logs orthogonal.com click-throughs. `/api/admin` + `/admin` page
  (gated by `ADMIN_PASSWORD` via `Authorization: Bearer` header) show searches/spend/
  errors/conversions.

## NON-NEGOTIABLE: no caching of Orthogonal data
Per Orthogonal's data policy, **returned company/people data is NEVER persisted**.
Every search and every reveal is a fresh fetch. There is no result cache and no
in-flight dedup. Supabase stores ONLY our own usage metadata: rate-limit events,
spend ledger, analytics. **Do not re-introduce caching of provider responses.**

Cost: ≈ **$0.39/search** (profile $0.012 + workforce $0.061 + CE people×5 $0.1225 +
ContactOut ×2 pages $0.10 + Tomba domain-search $0.01 + competitors $0.01 +
email-format $0.01 + Seltz ×6 $0.038). Fundable funding fallback adds **$0.066**
on top for companies with thin CE funding data (fetches only the most recent round —
amount + date + type + investors). NOT included in the upfront reservation (fires on
a minority of searches) — `reconcileSpend` handles the delta.
**Capacity under a hard $20 cap: ~51 searches/day** (ESTIMATE_USD ≈ $0.39 → ~51).
Worst-case single search (Fundable fires): ~$0.46. To raise capacity: lower
`EMPLOYEE_PAGE_SIZE` (each unit saves $0.0245) or raise `DAILY_SPEND_CAP_USD`.

**The ledger charges the REQUESTED CE page size, not the returned count** — CE bills
on requested page size, so charging the returned count let the hard cap pass
~25-35% more real spend than it recorded. `Promise.allSettled` is used so a
single-source failure doesn't blank the whole employees section.

Reveals are billed on demand on top:
- **Employee reveal (CE row)** — CE `/people/email` hit = $0.12; CE miss →
  ContactOut fallback = $0.12 + $0.55 = **$0.67**.
- **Employee reveal (ContactOut or Tomba row)** — no `ceId`, goes straight to
  ContactOut `/v1/linkedin/enrich` = **$0.55**.

## Orthogonal / provider specifics
- Proxy pattern (server-only): `POST https://api.orth.sh/v1/run`,
  `Authorization: Bearer $ORTHOGONAL_API_KEY`, body `{api, path, query|body}`,
  response `{success, data}`. See `lib/orthogonal.ts`.
- **GOTCHA: `/v1/run` validates GET query values as STRINGS.** A numeric value is
  rejected. The client coerces all GET query values to strings — keep that. GET vs
  POST is signalled by whether params go in `query` or `body`.
- **GOTCHA: `company-enrich /companies/enrich` has BOTH a GET (by domain) and a POST
  (by name/social) at the same path.** Pass `query` for by-domain, `body` for by-name.
- **GOTCHA: ContactOut `/v1/linkedin/enrich` shape (reveal).** → `{ profile: {
  work_email:[], personal_email:[], phone:[], email:[] } }` (single `profile`,
  SINGULAR names, each a string[]). Reading the wrong shape silently returns null AND
  still charges — this was the PR #2 bug.
- **GOTCHA: ContactOut `/v1/people/search` shape (discovery).** → `{ profiles:
  Record<linkedinUrl, RawCoProfile>, metadata: { total_results } }`. The key IS the
  LinkedIn URL. `contact_availability.work_email` is a boolean flag (has email on
  file, not the email itself). `reveal_info: false` must be passed to keep cost at
  $0.05 flat — setting it true reveals emails inline but costs much more.
- **GOTCHA: ContactOut people search is domain-scoped at the API level** — searching
  `plaid.co.jp` returns Japanese PLAID Inc. employees (193 results), not US Plaid
  employees (1,525 results). Each TLD is a distinct index. No extra filtering needed
  on our side for CO.
- **GOTCHA: Tomba domain contamination.** Tomba `/v1/domain-search` can return
  employees from same-named companies at different TLDs (verified: `plaid.com` search
  returned `@plaid.co.jp` emails from an unrelated Japanese company). Always pass
  `domain` to `mapTombaEmployees` — the mapper filters out any row whose email domain
  doesn't exactly match.
- **GOTCHA: CE `/people/search` `seniority` filter wants HYPHENATED values**
  (`"c-suite"`, not `"c_suite"` → 400). Not currently used, but kept as a gotcha.
- **Spend ledger is in DOLLARS** — reserve/reconcile pass dollar amounts (per-call
  prices vary by provider). Don't revert to a flat per-call multiplier.
- **GOTCHA: Seltz response shape.** Top-level key is `documents` (NOT `results`).
  Each doc has `url`, `content`, `published_date` — **no `title` field**. Extract a
  title from `content` by stripping markdown `#` headers and taking the first
  meaningful line. Content has backslash-escaped markdown (`\\.`, `\\(` etc.) —
  strip with `replace(/\\([^\\])/g, '$1')` before display. Mapper in `lib/seltz.ts`.
  6 calls per search ($0.00625 each): 3 signal queries (funding/product/customer) +
  2 job queries + 1 narrative query. All via `Promise.allSettled`; per-call cost
  charged on success only. Stream sections: `signals`, `jobs`, `narrative`.
- Mappers + raw shapes: `lib/companyenrich.ts` (enrich/workforce/people/email),
  `lib/contactout.ts` (people search discovery + reveal), `lib/tomba.ts` (similar +
  domain-search employee augment + email-format), `lib/fundable.ts` (funding-rounds
  fallback, with sanity filter), `lib/seltz.ts` (web signals/jobs/narrative),
  `lib/format.ts` (`countryCode()` + `fmtMoney()`).
- Data quality notes (from live testing 2026-06-23):
  - ContactOut skews toward recruiting/HR roles for large companies (recruiters are
    more LinkedIn-active). C-suite and engineering are present but less represented.
  - ContactOut data can be stale — employees who've left a company may still appear.
    This is a provider data freshness issue, not fixable at our layer.
  - CE workforce headcount lags reality by 1-2 years for fast-growing companies.
  - Good demo targets (verified): stripe.com, google.com, spacex.com, figma.com,
    plaid.com.

## Supabase (the persistent store — SHARED across all Orthogonal demo sites)
**This project shares one Supabase instance with all other Orthogonal demo sites.**
Free-tier quotas (500 MB DB, row limits, cron slots) are pooled. Every table has a
`site` column; rolodex scopes itself to `SITE_ID` (`lib/site.ts`, default `'rolodex'`,
env-overridable) so its caps, analytics, and rate limits are isolated. **Never touch
rows or objects that belong to another site.** When adding a new table or cron job,
prefix it or tag it with `SITE_ID` so siblings are unaffected.

- Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (service-role, server-only).
- Run `supabase/schema.sql` once in the SQL editor. Tables: `rate_events`,
  `spend_events` (incl. `ip_hash` for per-IP sub-cap), `search_events`. Functions:
  `check_and_log_rate` (advisory-locked), `day_spend`,
  `record_spend(p_cost,p_site,p_ip)`, `reserve_spend(p_estimate,p_cap,p_site,p_ip,p_ip_cap)`
  (atomic hard cap + per-IP sub-cap). The code calls the 5-arg `reserve_spend` /
  3-arg `record_spend`; if the DB still has the old signatures the RPC errors and
  `reserveSpend` fails CLOSED → 503s. `p_ip`/`p_ip_cap` are defaulted, so siblings
  calling the old arity keep working. **If you recreate the project, run the full
  `supabase/schema.sql`.**
- **All 4 functions have `set search_path = public, pg_temp` pinned** (clears the
  Supabase "Function Search Path Mutable" linter warning; applied live 2026-06-17).
- **Isolation:** spend cap, analytics, and rate limit are all site-scoped. `p_site =
  NULL` means "sum ALL rows" (legacy back-compat for siblings that don't pass a site).
- **Free-tier ops (both DONE in prod — keep this way):**
  1. **`pg_cron` enabled** + a daily `prune` job (04:00 UTC) trimming `rate_events`
     (>2d), `spend_events` (>40d), `search_events` (>90d).
  2. The daily **`/api/cron/keepalive`** Vercel cron keeps the project from pausing
     after 7 days idle (paused DB → spend check fails closed → whole site 503s).
- Degrades gracefully when unset (dev): rate limit allows all, spend cap off,
  analytics no-op. **Required in prod.**
- `lib/spend.ts` fails CLOSED on DB error (money guard); `lib/ratelimit.ts` fails
  OPEN (spend cap is the backstop).

## Abuse protection (no CAPTCHA)
Cloudflare Turnstile was **removed** (2026-06-15) — do NOT re-add without asking.
Layered code-level defenses guard **both** money-spending routes (`/api/search`,
`/api/reveal`). In order:
1. **Origin lock** — `originAllowed()` rejects cross-origin POSTs (403).
2. **Bot-UA filter** — `isBotUserAgent()` blocks empty / obviously-scripted UAs.
3. **Per-IP rate limit** — Supabase-backed, coarse anti-burst. Defaults **30/min ·
   300/hr · 1000/day** per hashed IP, env-tunable. Fails OPEN on DB error.
4. **Per-session (cookie) budget** — `lib/session.ts`. Signed HMAC cookie, daily $
   total; `SESSION_DAILY_USD` (default $3) per-browser allowance. Soft (bypassable
   by clearing cookies) — fairness guard, not a hard stop.
5. **Per-IP daily spend sub-cap** — `PER_IP_DAILY_USD` (default $5), enforced
   atomically inside `reserve_spend`. HARD per-visitor backstop. Rejection →
   `reason:'perip'` → 429.
6. **Global daily spend cap** — `DAILY_SPEND_CAP_USD` (default $20). Atomic hard
   cap via Postgres advisory lock (reserve worst-case up front, reconcile after).
   Fails CLOSED on DB error.

If distributed bots become a problem, prefer **Vercel WAF/Firewall** over a CAPTCHA.

## Product decisions (from the user)
- **No company blocklist** — any real company is searchable. Only free-email
  providers / localhost / IPs are rejected as invalid input (`lib/normalize.ts`).
- **No department/seniority filter on CE people search** — return all employees
  including C-suite and founders. Filter only non-employee relationship titles
  (investor, board member, advisor) via `NON_EMPLOYEE_ROLE` in `lib/companyenrich.ts`.
- Rate limits: **30/min, 300/hr, 1000/day** per IP (env `RATE_PER_*`).
- Spend caps: **global** `DAILY_SPEND_CAP_USD` (code default 20), **per-IP**
  `PER_IP_DAILY_USD` (default $5, hard), **per-session cookie** `SESSION_DAILY_USD`
  (default $3, soft). All editable in Vercel env (require redeploy to take effect).
- **Employee list** — unified 3-source list capped at 50 (env `EMPLOYEE_LIST_MAX`).
  Reveal always offered on all rows regardless of source. CE rows show green "verified"
  badge, ContactOut rows show blue "enriched" badge, Tomba rows show amber "pattern"
  badge.
- Reveals share the per-IP rate-limit budget with searches.
- "Powered by orthogonal.com" appears only in the footer. Header CTA = "ORTHOGONAL.COM ↗".
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
- Commit messages end with: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`
- Only commit/push when asked.
- **Git identity (REQUIRED):** every commit must use `Angularious <jerry@orthogonal.sh>`. The
  repo already has this set locally (`.git/config`); the global git config defaults to Gmail,
  which is wrong for this repo. Before any commit, verify with `git config user.name` (should
  return `Angularious`) and `git config user.email` (should return `jerry@orthogonal.sh`). If
  the wrong identity is active, run:
  ```
  git config user.name "Angularious"
  git config user.email "jerry@orthogonal.sh"
  ```
  **Never use `--global`** — that would change the identity for all repos on the machine.
