# Tasks: Seltz Web Intelligence Integration

## Phase 1 — API wrapper
- [ ] Create `lib/seltz.ts`: `search(query, maxResults?)` via `callOrthogonal`, typed raw shape, mapper that extracts `{ url, title, snippet, date }` defensively
- [ ] Add `SELTZ_COST = 0.00625` constant; add `PRICE.seltz` entries in route.ts; update `ESTIMATE_USD`
- [ ] Test raw Seltz response shape against a real company (stripe.com) — capture actual field names before building mappers

## Phase 2 — Backend: new stream sections
- [ ] Add `signals` job in route.ts: 5 parallel Seltz calls (news + launch + press + customer + G2), emit `{ type: 'signals', data: Signal[] }`
- [ ] Add `jobs` job in route.ts: 2 parallel Seltz calls (Lever/Greenhouse + LinkedIn), emit `{ type: 'jobs', data: JobSignal[] }`
- [ ] Add `narrative` job in route.ts: conditional Seltz call when `company.description?.length <= 100`, emit `{ type: 'narrative', description: string }`
- [ ] Add spend accounting for all Seltz calls (per-call, charged on success, same pattern as Tomba/CE)
- [ ] Add new stream message types to `lib/types.ts`

## Phase 3 — Frontend: Signals tab
- [ ] Create `components/SignalsTab.tsx`: renders `Signal[]` as a card list — headline, source domain favicon/name, date, truncated excerpt, external link
- [ ] Add "Signals" tab to the tab bar (between Employees and Competitors)
- [ ] Show skeleton loader while signals stream in; show empty state ("No recent signals found") gracefully

## Phase 4 — Frontend: Workforce & Hiring tab
- [ ] Rename "Departments" tab → "Workforce & Hiring"
- [ ] Below existing CE department breakdown, add a "Hiring Activity" section rendering `JobSignal[]` — role title, inferred department, link to posting
- [ ] Group job signals by inferred department (parse title for eng/sales/marketing/ops/etc.)
- [ ] Empty state: show only CE departments if no Seltz job results

## Phase 5 — Frontend: Narrative patch
- [ ] Client handles `{ type: 'narrative' }` message: if current company description is short/empty, patch it in the company card
- [ ] No visual indicator needed — seamless update

## Phase 6 — Polish & cleanup
- [ ] Update OrchestrationTrace labels for new sections (capability-based: "Web signals", "Hiring activity", "Web narrative")
- [ ] Update CLAUDE.md: new sections, cost table, Seltz provider notes, ESTIMATE_USD
- [ ] Run `npm run build` — fix any type errors
- [ ] Manual smoke test: stripe.com, spacex.com, figma.com — verify all 3 new sections render
