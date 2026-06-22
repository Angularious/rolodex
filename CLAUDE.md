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
  response) if `GET /companies/enrich?domain=` fails. **Funding fallback:** if the
  resolved profile has no round-level funding detail, the company job pulls
  structured rounds from **Aviato** (`/company/funding-rounds`, flat $0.08) and
  merges them in before emitting `company` (so the card waits only when funding is
  thin). **Thin = no rounds OR rounds present but none carry a dollar amount** (CE
  often returns round types/dates/investors with `amount: null` → "—", e.g.
  scale.com). Aviato rounds are sanity-filtered in `lib/aviato.ts` (drop rows raising
  more than the company's max known valuation + acquisition/IPO-shaped rows — this
  is what kills Aviato mislabelling, e.g. the $20B Adobe deal as a "Venture Round").
  **Employee augment:** the `employees` section is CE `/people/search` FIRST, then —
  when the CE list is shorter than `EMPLOYEE_LIST_MAX` (default 15) — topped up with
  **Tomba `/v1/domain-search`** (flat $0.01, up to 50, emails inline). Tomba rows are
  mapped to the same `Employee` shape, `source:'tomba'` + `emailUnverified:true`, and
  **deduped against CE by normalized LinkedIn URL then full name** (`mergeEmployees`
  in `lib/tomba.ts`) so no CE profile is duplicated. Tomba rows have **no photo / city
  / startDate / ceId** (Tomba doesn't return them) and their emails are unverified
  pattern guesses — the UI labels them "unverified · likely" and still offers Enrich
  (ContactOut by LinkedIn) to verify / add a phone. Tomba failure keeps the CE-only
  list. This is an AUGMENT (not the replacement option) — it adds $0.01, doesn't cut
  cost; it trades a penny for breadth + free (unverified) emails.
- **`/api/reveal`** is the on-demand email/phone route (per-click, not streamed).
  Same gating as search. Tiered: Company Enrich `/people/email` by person id ($0.12)
  → fall back to ContactOut `/v1/linkedin/enrich` ($0.55). Records real dollar cost.
- Shared gating lives in `lib/guard.ts` (`originAllowed`, `isBotUserAgent`), reused
  by both money-spending routes.
- Client (`app/page.tsx`) reads the stream and renders sections progressively; the
  Employees and Decision-makers tabs call `/api/reveal` per row.
- **Graph View** (`components/circuit/`) is the **default**, **full-screen** results view
  (Table View = the tabs, toggled). It's a **circuit-schematic drill-down map** —
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
    **detail panel** slides in (terminal-style readout; decision-maker/employee **Enrich**
    reuses `revealContact`). Click ROOT breadcrumb / root node → back to level 0. One
    branch expanded at a time (avoids the old "too dense" problem).
  - `geometry.ts` = **pure layout math** (no React): `buildBuses` (categories with data →
    `Bus[]`; supports **N buses**, not hardcoded — decision-makers/departments/competitors/
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
  the app cap trips first; the quota path is the backstop. Quota detection is best-effort
  (keyword-based) — tighten once a real limit response is observed.
- `/api/track` logs orthogonal.com click-throughs. `/api/admin` + `/admin` page
  (gated by `ADMIN_PASSWORD`) show searches/spend/errors/conversions.

## NON-NEGOTIABLE: no caching of Orthogonal data
Per Orthogonal's data policy, **returned company/people data is NEVER persisted**.
Every search and every reveal is a fresh fetch. There is no result cache and no
in-flight dedup. Supabase stores ONLY our own usage metadata: rate-limit events,
spend ledger, analytics. **Do not re-introduce caching of provider responses.**
Cost: ≈ **$0.34/search** at `PAGE_SIZE=8` (profile $0.012 + workforce $0.061 +
people×8 $0.196 + competitors $0.01 + decision-makers $0.05 + Tomba employee-augment
$0.01 when the CE list is thin). `PAGE_SIZE` (env
`EMPLOYEE_PAGE_SIZE`, default 8, in `app/api/search/route.ts`) is the cost knob
(per-result $0.0245); the people-search line dominates. **The ledger charges the
REQUESTED `PAGE_SIZE`, not the returned count** — CE bills on requested page size,
so charging the returned count let the hard cap pass ~25-35% more real spend than
it recorded (verified: figma returns 6 for a request of 8). **`DM_PAGE_SIZE` is
decoupled from `PAGE_SIZE`** — the decision-makers call is a flat $0.05 regardless
of `per_page` (`reveal_info=false`), so it stays at 25 to surface more
decision-makers for free; only the employee people-search scales with count.
**Capacity under a hard $20 cap: ~45–58 full searches/day total** (worst-case
reservation $0.44 → ~45; typical search $0.34 → ~58), shared across all visitors —
so ~100 users each running one real search does NOT fit in $20; the per-IP and
per-session caps decide who gets served and stop one actor taking it all. (NOTE: the
Tomba employee augment we chose ADDS $0.01 for breadth; the alternative — REPLACING
CE people-search with Tomba — would instead cut ~$0.19/search → ~140 searches/$20,
at the cost of verified-email quality. Revisit if the $20 ceiling needs to stretch.) **Funding fallback (Aviato $0.08) fires when
CE rounds are missing dollar amounts** (no rounds, or rounds with null amounts), so
it adds to a search's cost (≈ $0.46) only on those; worst case is reserved up front
in `ESTIMATE_USD`.
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
  `lib/contactout.ts` (decision-makers/reveal), `lib/tomba.ts` (similar +
  domain-search employee augment),
  `lib/aviato.ts` (funding-rounds fallback, with sanity filter).
- Data quality varies by domain. Good demo targets (verified): stripe.com,
  google.com, spacex.com, figma.com.

## Supabase (the persistent store)
- Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (service-role, server-only).
- Run `supabase/schema.sql` once in the SQL editor. Tables: `rate_events`,
  `spend_events` (now incl. an `ip_hash` column for the per-IP sub-cap),
  `search_events`. Functions: `check_and_log_rate` (advisory-locked), `day_spend`,
  `record_spend(p_cost,p_site,p_ip)`, `reserve_spend(p_estimate,p_cap,p_site,p_ip,p_ip_cap)`
  (atomic hard cap + per-IP sub-cap). **MIGRATION REQUIRED before deploying the
  per-IP-cap code:** re-run `supabase/schema.sql` (idempotent — adds the `ip_hash`
  column + drops/recreates the two functions with their new signatures). The code
  calls the 5-arg `reserve_spend` / 3-arg `record_spend`; if the DB still has the old
  signatures the RPC errors and `reserveSpend` fails CLOSED → 503s. `p_ip`/`p_ip_cap`
  are defaulted, so siblings calling the old arity keep working.
  **If you recreate the project, run the full `supabase/schema.sql`.**
- **All 4 functions have `set search_path = public, pg_temp` pinned** (clears the
  Supabase "Function Search Path Mutable" linter warning; applied live 2026-06-17).
  It's baked into the `create or replace` blocks in `schema.sql`, so a fresh recreate
  comes up hardened. To patch an existing DB without re-pasting bodies, use
  `alter function <name>(<argtypes>) set search_path = public, pg_temp;`.
- **SHARED PROJECT: other Orthogonal demo sites use this same Supabase project.**
  Rows are tagged with a `site` column and this site scopes itself to `SITE_ID`
  (`lib/site.ts`, default `'rolodex'`, env-overridable). What's isolated vs. not:
  - **Spend cap — ISOLATED.** `day_spend`/`reserve_spend`/`record_spend` take an
    optional `p_site`; rolodex passes `SITE_ID`, so its daily cap counts only its
    own `spend_events` rows. The advisory lock in `reserve_spend` is keyed per
    site, so sites reserve in parallel. A busy sibling can no longer trip rolodex's
    cap.
  - **Analytics — ISOLATED.** `search_events` rows are tagged `site`; `/admin`
    (`recentEvents`) filters to `SITE_ID`.
  - **Rate limit — NOW ISOLATED (changed 2026-06-22).** `rate_events` gained a
    `site` column and `check_and_log_rate` takes an optional `p_site`; rolodex passes
    `SITE_ID`, so its per-IP windows count only its own rows. (Was intentionally
    pooled, but rolodex loosened its limits to 30/300/1000 for shared/NAT networks —
    pooling would have flooded the shared ledger and tripped siblings' tighter limits.
    Scoping mirrors the spend design.) Siblings passing no `p_site` keep legacy pooled
    behavior (count ALL rows) until they adopt their own `SITE_ID`.
  - **Back-compat:** `p_site = NULL` means "sum ALL rows" (legacy), so sibling
    sites that DON'T pass a site keep their old pooled behavior unchanged. Until a
    sibling adopts its own `SITE_ID`, its cap still counts rolodex's tagged rows;
    rolodex is unaffected either way.
  - **Historical rows are untagged (`site = NULL`)** — they pre-date this change and
    can't be attributed, so they're excluded from rolodex's scoped views. Right
    after the migration `/admin` and "spent today" look reset; they refill as new
    tagged rows land (and old rows age out via the prune job anyway).
  - DB migration applied live 2026-06-17. **Run `supabase/schema.sql` (or the
    migration block) BEFORE deploying code that passes `p_site`** — otherwise the
    3-arg RPC has no matching function and `reserveSpend` fails closed → 503s.
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
Cloudflare Turnstile was **removed** (2026-06-15) — no bot-challenge box. Layered
code-level defenses guard **both** money-spending routes (`/api/search`,
`/api/reveal`) via `lib/guard.ts` / `lib/spend.ts` / `lib/session.ts`. Design
principle: the **$ caps are the money guard**, so the request-rate limit can stay
loose enough that shared/NAT'd networks (a whole school/office on one public IP)
aren't request-blocked. In order:
1. **Origin lock** — `originAllowed()` rejects cross-origin POSTs (403). Allows
   requests whose `Origin` matches the serving host, or the explicit
   `ALLOWED_ORIGIN` env var. Stops other sites calling/embedding our API.
2. **Bot-UA filter** — `isBotUserAgent()` blocks empty / obviously-scripted UAs.
3. **Per-IP rate limit** — Supabase-backed, coarse anti-burst only (NOT the money
   guard). Defaults **30/min · 300/hr · 1000/day** per hashed IP, env-tunable via
   `RATE_PER_MIN`/`RATE_PER_HOUR`/`RATE_PER_DAY` (loosened from 12/60/120 so NAT'd
   networks don't hit a wall now that $ is capped per-IP). Competitor click-throughs
   count. Fails OPEN on DB error (`lib/ratelimit.ts`).
4. **Per-session (cookie) budget** — `lib/session.ts`. A signed (HMAC) cookie holds
   each browser's running daily $ total; `SESSION_DAILY_USD` (default $3) is the
   per-browser allowance. NAT-friendly (each browser gets its own budget, doesn't
   penalize a shared IP) but SOFT — bypassable by clearing cookies, so it's a
   fairness guard, not a hard stop. Sign key = `SESSION_SECRET` (falls back to
   `IP_HASH_SALT`). A bad signature / stale UTC day resets to a fresh budget. Bumps
   by the worst-case estimate; over-budget → 429 `rate_limited` until UTC midnight.
5. **Per-IP daily spend sub-cap** — `PER_IP_DAILY_USD` (default $5), enforced
   atomically inside `reserve_spend` (per-IP sum of today's `spend_events.ip_hash`,
   under the same advisory lock as the global cap). The HARD per-visitor backstop:
   one IP can't take more than its slice of the global cap. `<=0` disables it.
   Rejection returns `reason:'perip'` → mapped to a 429 (vs `'global'` → 503).
6. **Global daily spend cap** — `DAILY_SPEND_CAP_USD` (default $20). **Atomic hard
   cap**: each request RESERVES its worst-case cost up front via the `reserve_spend`
   RPC (serialized by a Postgres advisory lock), then reconciles to the real cost
   after (`reserveSpend`/`reconcileSpend` in `lib/spend.ts`). Holds under concurrent
   bursts. Fails CLOSED on DB error. **Reconciliation rows carry the same `ip_hash`
   as the reservation** so the per-IP daily sum nets to true per-visitor spend.

**Tradeoff to remember:** under a hard $20 global cap a shared NAT network can't be
fully served regardless of knobs (the money runs out at ~50-60 searches/day total).
The per-IP cap spreads the budget across visitors; raise `PER_IP_DAILY_USD` if
serving more users on one shared IP matters more than even spread. The session
cookie is the only NAT-friendly per-user lever, but it's soft.

Do NOT re-add Turnstile/CAPTCHA without asking — the user explicitly removed it
(the box was annoying). If distributed bots become a problem, prefer Vercel
WAF/Firewall (dashboard-configured, no visible challenge) over a CAPTCHA.

## Product decisions (from the user)
- **No company blocklist** — any real company is searchable. Only free-email
  providers / localhost / IPs are rejected as invalid input (`lib/normalize.ts`).
- Rate limits: **30/min, 300/hr, 1000/day** per IP (env `RATE_PER_*`; loosened so
  NAT'd shared networks aren't request-blocked — the $ caps are the money guard now).
  Competitor clicks count.
- Spend caps (all UTC-day buckets, atomic reserve/reconcile — see Abuse protection):
  **global** `DAILY_SPEND_CAP_USD` (code default 20), **per-IP** `PER_IP_DAILY_USD`
  (default $5, hard backstop), **per-session cookie** `SESSION_DAILY_USD` (default $3,
  soft/NAT-friendly). All editable in Vercel env without a deploy.
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
