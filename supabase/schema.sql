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

-- Once a shift is created, a worker may only ever fill in its clock-out
-- fields — not rewrite when/where they clocked in, or reassign it to
-- someone else. Keeps the timesheet trustworthy for payroll.
create or replace function public.protect_clock_in_fields()
returns trigger
language plpgsql
as $$
begin
  if new.worker_id is distinct from old.worker_id
     or new.clock_in_at is distinct from old.clock_in_at
     or new.clock_in_lat is distinct from old.clock_in_lat
     or new.clock_in_lng is distinct from old.clock_in_lng
  then
    raise exception 'clock_in fields and worker_id cannot be changed after creation';
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

-- Workers can only update their own *currently open* entry (i.e. clocking
-- out). Once clock_out_at is set the row is closed for everyone except via
-- the Supabase dashboard (no admin write policy is defined on purpose).
drop policy if exists time_entries_update_own_open_shift on public.time_entries;
create policy time_entries_update_own_open_shift
  on public.time_entries for update
  using (worker_id = auth.uid() and clock_out_at is null)
  with check (worker_id = auth.uid());
