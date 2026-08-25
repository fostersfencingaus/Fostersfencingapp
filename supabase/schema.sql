-- Worker clock-in feature: schema + Row Level Security.
--
-- Run this once in the Supabase project's SQL editor (Dashboard → SQL Editor
-- → New query → paste → Run). Safe to re-run: every statement is
-- create-if-not-exists / create-or-replace.
--
-- See ../docs/clock-in-setup.md for the full setup walkthrough, including
-- how to create the worker/admin logins that these tables reference.

create extension if not exists pgcrypto;

-- One row per login (worker or admin), keyed to the matching Supabase Auth
-- user. Created by hand in the dashboard for each of the 3 workers + the
-- owner's admin account — there is no public sign-up flow.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  is_admin boolean not null default false,
  -- Pay rate fields, set per worker by the owner directly in this table
  -- (not editable from either page) — used to calculate weekly pay and
  -- payslips. Leave null for logins that don't get paid through this
  -- (e.g. the admin/owner account).
  hourly_rate numeric,
  tax_rate numeric,   -- e.g. 0.24 for 24%
  super_rate numeric, -- e.g. 0.12 for 12%, paid on top of gross
  created_at timestamptz not null default now()
);

-- One row per clock-in; clock-out fields are filled in later by an update.
create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles(id) on delete cascade,
  clock_in_at timestamptz not null default now(),
  clock_in_lat double precision,
  clock_in_lng double precision,
  clock_in_accuracy_m double precision,
  clock_out_at timestamptz,
  clock_out_lat double precision,
  clock_out_lng double precision,
  clock_out_accuracy_m double precision,
  -- Set the moment a worker hand-corrects clock_in_at or clock_out_at
  -- (see protect_clock_in_fields below) — null on an untouched, live-GPS row.
  edited_at timestamptz,
  -- Auto-computed the moment clock_out_at is set; null while still clocked in.
  hours_worked numeric generated always as (
    case
      when clock_out_at is null then null
      else round((extract(epoch from (clock_out_at - clock_in_at)) / 3600.0)::numeric, 2)
    end
  ) stored,
  created_at timestamptz not null default now()
);

create index if not exists time_entries_worker_id_idx on public.time_entries (worker_id);

-- Enforces "one open shift per worker" — a worker can't clock in twice
-- without clocking out first (also guards against double-tap race conditions).
create unique index if not exists time_entries_one_open_shift_per_worker
  on public.time_entries (worker_id)
  where clock_out_at is null;

-- Looks up whether the calling user is an admin. security definer so it can
-- read profiles regardless of the caller's own RLS grant, without which the
-- "is_admin" policies below would recurse into themselves.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- Workers can hand-correct their own clock in/out times (forgotten taps,
-- wrong times) but can never reassign a shift to someone else. Trust is
-- kept via edited_at (visible to the admin) plus dropping whatever GPS fix
-- was attached to a time the instant that time is hand-edited — a location
-- captured for the old time doesn't mean anything for the corrected one.
-- The very first time clock_out_at is set (a normal Clock Out tap, which
-- legitimately submits live GPS alongside it) is not treated as an edit.
create or replace function public.protect_clock_in_fields()
returns trigger
language plpgsql
as $$
begin
  if new.worker_id is distinct from old.worker_id then
    raise exception 'worker_id cannot be changed after creation';
  end if;

  if new.clock_in_at is distinct from old.clock_in_at then
    new.clock_in_lat := null;
    new.clock_in_lng := null;
    new.clock_in_accuracy_m := null;
    new.edited_at := now();
  end if;

  if old.clock_out_at is not null and new.clock_out_at is distinct from old.clock_out_at then
    new.clock_out_lat := null;
    new.clock_out_lng := null;
    new.clock_out_accuracy_m := null;
    new.edited_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists time_entries_protect_clock_in on public.time_entries;
create trigger time_entries_protect_clock_in
  before update on public.time_entries
  for each row execute function public.protect_clock_in_fields();

alter table public.profiles enable row level security;
alter table public.time_entries enable row level security;

drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

drop policy if exists time_entries_select_own_or_admin on public.time_entries;
create policy time_entries_select_own_or_admin
  on public.time_entries for select
  using (worker_id = auth.uid() or public.is_admin());

drop policy if exists time_entries_insert_own on public.time_entries;
create policy time_entries_insert_own
  on public.time_entries for insert
  with check (worker_id = auth.uid());

-- Workers can update any of their own shifts, open or already closed (see
-- protect_clock_in_fields for what happens to the GPS fields when they do).
-- There's still no admin write policy — the owner corrects things, if ever
-- needed, via the Supabase dashboard.
drop policy if exists time_entries_update_own_open_shift on public.time_entries;
drop policy if exists time_entries_update_own on public.time_entries;
create policy time_entries_update_own
  on public.time_entries for update
  using (worker_id = auth.uid())
  with check (worker_id = auth.uid());
