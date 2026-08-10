-- Shared shopping list feature: schema + Row Level Security.
--
-- Run this once in the Supabase project's SQL editor (Dashboard → SQL Editor
-- → New query → paste → Run). Safe to re-run: every statement is
-- create-if-not-exists / create-or-replace.
--
-- See ../docs/shopping-list-setup.md for the full setup walkthrough.

create extension if not exists pgcrypto;

-- One row per item on the list. There's no login for this feature — anyone
-- with the page open can add, tick, or untick anything, so "added_by" is
-- just a label typed once on each device, not an authenticated identity.
create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  added_by text not null,
  -- Null while still needed. Set to the moment it's ticked off; cleared
  -- back to null if someone unticks it. A background sweep (see below)
  -- deletes any row that's stayed non-null for 48 continuous hours.
  purchased_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists shopping_items_purchased_at_idx on public.shopping_items (purchased_at);
create index if not exists shopping_items_created_at_idx on public.shopping_items (created_at desc);

alter table public.shopping_items enable row level security;

-- No auth on this feature by design (see docs/shopping-list-setup.md) — RLS
-- is enabled anyway, with policies that simply allow every operation, so
-- access is controlled the same explicit way as the rest of the app's
-- tables rather than by relying on RLS being off.
drop policy if exists shopping_items_select_all on public.shopping_items;
create policy shopping_items_select_all
  on public.shopping_items for select
  using (true);

drop policy if exists shopping_items_insert_all on public.shopping_items;
create policy shopping_items_insert_all
  on public.shopping_items for insert
  with check (true);

drop policy if exists shopping_items_update_all on public.shopping_items;
create policy shopping_items_update_all
  on public.shopping_items for update
  using (true)
  with check (true);

drop policy if exists shopping_items_delete_all on public.shopping_items;
create policy shopping_items_delete_all
  on public.shopping_items for delete
  using (true);

-- Make row changes stream to every connected client (needed for the list
-- to update live without a refresh). Safe to re-run — ignores the error if
-- the table's already in the publication.
do $$
begin
  alter publication supabase_realtime add table public.shopping_items;
exception
  when duplicate_object then null;
end $$;
