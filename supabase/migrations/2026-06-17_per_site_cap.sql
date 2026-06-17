-- Per-site spend cap + analytics isolation on the SHARED Supabase project.
-- Run this ONCE in the Supabase SQL editor BEFORE deploying the code that passes
-- p_site (otherwise the 3-arg RPC has no match and reserveSpend fails closed).
-- Idempotent and backward-compatible: sibling sites that still call the old
-- 2-arg signatures keep working (p_site defaults to NULL = legacy "sum all").
--
-- NOTE: function bodies use uniquely-named dollar-quote tags ($day_spend$ etc.)
-- rather than bare $$ — the Supabase SQL editor's statement splitter mis-pairs
-- repeated bare $$ blocks and truncates the batch.

-- 1. Tag columns + indexes (no-ops if already present).
alter table spend_events  add column if not exists site text;
alter table search_events add column if not exists site text;
create index if not exists spend_events_site_created_idx  on spend_events  (site, created_at);
create index if not exists search_events_site_created_idx on search_events (site, created_at desc);

-- 2. Replace the 3 spend functions with site-aware versions. Drop the old
--    signatures first (adding a param changes the signature, which
--    create-or-replace can't do) so PostgREST sees exactly one overload.
drop function if exists day_spend();
drop function if exists record_spend(numeric);
drop function if exists reserve_spend(numeric, numeric);

create or replace function day_spend(p_site text default null) returns numeric
language sql stable
set search_path = public, pg_temp
as $day_spend$
  select coalesce(sum(cost_usd), 0)::numeric
  from spend_events
  where created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
    and (p_site is null or site = p_site);
$day_spend$;

create or replace function record_spend(p_cost numeric, p_site text default null) returns void
language sql
set search_path = public, pg_temp
as $record_spend$
  insert into spend_events (cost_usd, site) values (p_cost, p_site);
$record_spend$;

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
