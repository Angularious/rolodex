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
create table if not exists spend_events (
  id bigint generated always as identity primary key,
  cost_usd numeric not null,
  created_at timestamptz not null default now()
);
create index if not exists spend_events_created_idx on spend_events (created_at);

-- Search analytics (and conversion markers as domain='__conversion__').
create table if not exists search_events (
  id bigint generated always as identity primary key,
  ip_hash text,
  domain text,
  duration_ms int,
  cost_usd numeric,
  success boolean,
  created_at timestamptz not null default now()
);
create index if not exists search_events_created_idx on search_events (created_at desc);

alter table rate_events enable row level security;
alter table spend_events enable row level security;
alter table search_events enable row level security;

-- ---------------------------------------------------------------- functions
-- Atomic rate limit: counts the three windows, logs the attempt if allowed.
create or replace function check_and_log_rate(
  p_id text, p_min int, p_hour int, p_day int
) returns json
language plpgsql
as $$
declare
  c int;
begin
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
$$;

-- Spend since the start of the current UTC day.
create or replace function day_spend() returns numeric
language sql stable
as $$
  select coalesce(sum(cost_usd), 0)::numeric
  from spend_events
  where created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
$$;

-- Append to the spend ledger.
create or replace function record_spend(p_cost numeric) returns void
language sql
as $$
  insert into spend_events (cost_usd) values (p_cost);
$$;

-- ---------------------------------------------------------------- maintenance
-- The ledgers grow unbounded. Optionally schedule periodic pruning with the
-- pg_cron extension (Dashboard → Database → Extensions → enable pg_cron):
--   select cron.schedule('prune', '0 4 * * *', $$
--     delete from rate_events  where created_at < now() - interval '2 days';
--     delete from search_events where created_at < now() - interval '90 days';
--   $$);
