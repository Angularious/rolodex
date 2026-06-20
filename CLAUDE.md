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
Cost: ≈ **$0.38/search** at 10 employees (profile $0.012 + workforce $0.061 +
people×10 $0.245 + competitors $0.01 + decision-makers $0.05). `PAGE_SIZE` in
`app/api/search/route.ts` is the cost knob (per-result $0.0245); the people-search
line dominates. **`DM_PAGE_SIZE` is decoupled from `PAGE_SIZE`** — the
decision-makers call is a flat $0.05 regardless of `per_page` (`reveal_info=false`),
so it stays at 25 to surface more decision-makers for free; only the employee
people-search scales with count. **Funding fallback (Aviato $0.08) fires when
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
  `lib/contactout.ts` (decision-makers/reveal), `lib/tomba.ts` (similar only),
  `lib/aviato.ts` (funding-rounds fallback, with sanity filter).
- Data quality varies by domain. Good demo targets (verified): stripe.com,
  google.com, spacex.com, figma.com.

## Supabase (the persistent store)
- Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (service-role, server-only).
- Run `supabase/schema.sql` once in the SQL editor. Tables: `rate_events`,
  `spend_events`, `search_events`. Functions: `check_and_log_rate` (advisory-locked),
  `day_spend`, `record_spend`, `reserve_spend` (atomic hard cap). Prod DB is current;
  **if you recreate the project, run the full `supabase/schema.sql`.**
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
  - **Rate limit — STILL POOLED (intentional).** `rate_events`/`check_and_log_rate`
    are keyed by hashed IP only; a visitor's per-IP budget is shared across sibling
    demos. That's conservative (good for abuse protection), so left as-is.
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
