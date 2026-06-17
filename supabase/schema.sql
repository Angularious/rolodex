-- Company Intel demo — Supabase schema.
-- Run this once in the Supabase SQL editor (Dashboard → SQL → New query).
-- Holds the rate-limit + spend counters and the analytics event log. Only the
-- server (service-role key) touches these; RLS is enabled with no public
-- policies so the anon key can't read or write.

-- ---------------------------------------------------------------- tables
-- One row per accepted request (rate-limit ledger).
create table if not exists rate_events (
  id bigint generated always as identity primary key,
  id_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_events_id_created_idx on rate_events (id_hash, created_at);

-- One row per paid batch of API calls.
-- `site` scopes rows to one demo site (this Supabase project is SHARED across
-- several). NULL = legacy/unscoped (older rows + sibling sites that don't tag).
create table if not exists spend_events (
  id bigint generated always as identity primary key,
  cost_usd numeric not null,
  site text,
  created_at timestamptz not null default now()
);
-- `add column if not exists` so re-running on an already-created DB backfills
-- the column (create table if not exists won't alter an existing table).
alter table spend_events add column if not exists site text;
create index if not exists spend_events_created_idx on spend_events (created_at);
create index if not exists spend_events_site_created_idx on spend_events (site, created_at);

-- Search analytics (and conversion markers as domain='__conversion__').
create table if not exists search_events (
  id bigint generated always as identity primary key,
  ip_hash text,
  domain text,
  duration_ms int,
  cost_usd numeric,
  success boolean,
  site text,
  created_at timestamptz not null default now()
);
alter table search_events add column if not exists site text;
create index if not exists search_events_created_idx on search_events (created_at desc);
create index if not exists search_events_site_created_idx on search_events (site, created_at desc);

alter table rate_events enable row level security;
alter table spend_events enable row level security;
alter table search_events enable row level security;

-- ---------------------------------------------------------------- functions
-- Atomic rate limit: counts the three windows, logs the attempt if allowed.
-- A per-key advisory lock serializes concurrent requests for the same id_hash so
-- the count-then-insert can't over-allow under a burst.
create or replace function check_and_log_rate(
  p_id text, p_min int, p_hour int, p_day int
) returns json
language plpgsql
set search_path = public, pg_temp
as $check_and_log_rate$
declare
  c int;
begin
  perform pg_advisory_xact_lock(1, hashtext(p_id));

  select count(*) into c from rate_events
    where id_hash = p_id and created_at > now() - interval '1 minute';
  if c >= p_min then
    return json_build_object('allowed', false, 'retry_after_sec', 60);
  end if;

  select count(*) into c from rate_events
    where id_hash = p_id and created_at > now() - interval '1 hour';
  if c >= p_hour then
    return json_build_object('allowed', false, 'retry_after_sec', 3600);
  end if;

  select count(*) into c from rate_events
    where id_hash = p_id and created_at > now() - interval '1 day';
  if c >= p_day then
    return json_build_object('allowed', false, 'retry_after_sec', 86400);
  end if;

  insert into rate_events (id_hash) values (p_id);
  return json_build_object('allowed', true);
end;
$check_and_log_rate$;

-- Spend since the start of the current UTC day, optionally scoped to one site.
-- p_site NULL → sum ALL rows (legacy behavior, for sibling sites that don't tag);
-- p_site set → only that site's rows. (drop first: adding a param changes the
-- signature, which create-or-replace can't do.)
drop function if exists day_spend();
create or replace function day_spend(p_site text default null) returns numeric
language sql stable
set search_path = public, pg_temp
as $day_spend$
  select coalesce(sum(cost_usd), 0)::numeric
  from spend_events
  where created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
    and (p_site is null or site = p_site);
$day_spend$;

-- Append to the spend ledger, tagged with the caller's site. (Used for
-- reconciliation; can be negative to correct an over-reservation — SUM handles
-- negative rows fine.)
drop function if exists record_spend(numeric);
create or replace function record_spend(p_cost numeric, p_site text default null) returns void
language sql
set search_path = public, pg_temp
as $record_spend$
  insert into spend_events (cost_usd, site) values (p_cost, p_site);
$record_spend$;

-- HARD spend cap, atomic, scoped per site. Reserves `p_estimate` against today's
-- ledger ONLY if it keeps the day under `p_cap`. A per-site advisory lock
-- serializes reservations for the SAME site so concurrent requests can't each
-- pass the check before any of them commit (the race that made the old
-- check-then-record cap a soft cap) — while letting different sites reserve in
-- parallel. The route reserves a worst-case estimate up front, then reconciles
-- the real cost after. p_site NULL → cap against ALL rows (legacy behavior).
drop function if exists reserve_spend(numeric, numeric);
create or replace function reserve_spend(p_estimate numeric, p_cap numeric, p_site text default null)
returns json
language plpgsql
set search_path = public, pg_temp
as $reserve_spend$
declare
  spent numeric;
begin
  perform pg_advisory_xact_lock(2, hashtext(coalesce(p_site, '')));

  select coalesce(sum(cost_usd), 0)::numeric into spent
    from spend_events
    where created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
      and (p_site is null or site = p_site);

  if spent + p_estimate > p_cap then
    return json_build_object('allowed', false, 'spent', spent);
  end if;

  insert into spend_events (cost_usd, site) values (p_estimate, p_site);
  return json_build_object('allowed', true, 'spent', spent + p_estimate);
end;
$reserve_spend$;

-- ---------------------------------------------------------------- maintenance
-- The ledgers grow unbounded; on the free tier (500MB) you MUST prune, or the
-- DB fills and the per-request COUNT(*) rate-limit queries slow down. Enable the
-- pg_cron extension (Dashboard → Database → Extensions → pg_cron), then run:
--   select cron.schedule('prune', '0 4 * * *', $$
--     delete from rate_events   where created_at < now() - interval '2 days';
--     delete from spend_events  where created_at < now() - interval '40 days';
--     delete from search_events where created_at < now() - interval '90 days';
--   $$);
-- Note: keep spend_events at least ~40 days so day_spend() always covers the
-- current UTC day with margin.
