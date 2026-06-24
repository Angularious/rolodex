# Spec: Seltz Web Intelligence Integration

**Goal:** Enrich every company report with live web intelligence via Seltz ($0.00625/call) — surfacing signals, hiring intent, customer mentions, and a richer narrative alongside the existing structured data.

**Target users:** GTM engineers and startup researchers who need trigger context (why reach out *now*) beyond headcount and org charts.

---

## Input / Output

Same input as today (company domain or name). Same streaming report, with four new sections emitted in parallel with existing ones.

## New stream sections

| Section | Stream type | Content |
|---------|------------|---------|
| Signals | `signals` | Recent news, funding announcements, product launches, customer/press mentions |
| Hiring | `jobs` | Active job postings — role titles, departments, seniority, links |
| Narrative | `narrative` | Richer company description when CE's is thin (client patches company card) |

**Departments tab** keeps the CE workforce breakdown; Seltz job data renders below it in the same tab (renamed "Workforce & Hiring").

## Seltz calls fired per search (all in parallel)

| Purpose | Query | Calls |
|---------|-------|-------|
| Recent news | `"{company}" news funding 2025` | 1 |
| Product/launch signals | `"{company}" product launch announcement 2025` | 1 |
| Press coverage | `"{company}" site:techcrunch.com OR site:bloomberg.com` | 1 |
| Customer/ICP mentions | `"powered by {company}" OR "{domain}" case study` | 1 |
| G2/Capterra reviews | `"{company}" site:g2.com OR site:capterra.com` | 1 |
| Job postings | `"{company}" jobs site:lever.co OR site:greenhouse.io 2025` | 1 |
| Job postings (LinkedIn) | `"{company}" hiring site:linkedin.com/jobs` | 1 |
| Narrative (conditional) | `"{domain}" about products what we do` | 1 (only when CE description ≤ 100 chars) |

**Total:** 7–8 Seltz calls = $0.044–$0.050 per search.

## Cost impact

| | Per search | Daily cap ($20) |
|---|---|---|
| Current (post-fix) | ~$0.36 | ~55/day |
| + Seltz (worst case) | ~$0.41 | ~48/day |

All 7 guaranteed Seltz calls included in `ESTIMATE_USD`. Narrative call is conditional but cheap enough to include too.

## Architecture

- `lib/seltz.ts` — `search(query, maxResults?)` wrapper + typed mapper
- New jobs in `app/api/search/route.ts` fire via `Promise.allSettled` alongside existing jobs
- Stream emits `signals`, `jobs`, `narrative` sections (same failure-isolation pattern as today)
- Client renders new tab + patches description; no new routes needed

## Out of scope

- Caching Seltz results (data policy: no persistence, same as other providers)
- Per-query cost tuning (`max_results` fixed at 5 for signals, 10 for jobs — enough signal, not bloated)
- AI summarization of Seltz content (raw excerpts only for now)
- Batch API (`batch_use`) — not needed at single-company granularity

## Decisions

- **Signals + customers → one tab** — both are "what's happening with this company" intel; separate tabs would fragment the story
- **Jobs augments Departments, not replaces** — CE workforce still fires (needed for headcount + profile fallback); keeping both in one tab is richer than either alone
- **Narrative is conditional** — only fires when CE description is ≤ 100 chars to avoid wasting $0.006 when CE already has good copy
- **max_results = 5 for signals, 10 for jobs** — more results = more noise for signals; jobs benefit from broader coverage
- **UI never names providers** — "Recent Signals", "Hiring Activity", not "Seltz results"
